/**
 * Run watcher (owner, 2026-11-27): knows when the agent run behind a prompt has ended, from the
 * network, so a reply wait can stop when the run is over and the screen stays still (a tool call
 * with no renderer, a server error without a banner, a busy flag that never clears) instead of
 * sitting out a 30-180 s timeout on a frozen clip.
 *
 * READ ONLY: a second CDP session listens to Network events and streams the response bodies of the
 * run POSTs; nothing is injected into the page and no request is changed. What counts as a run:
 * - a POST to `/agent/<id>/run` (CopilotKit REST runtime), a single-endpoint POST whose body is
 *   `"method":"agent/run"`, or a GraphQL `generateCopilotResponse` POST (older CopilotKit);
 * - any other fetch/XHR POST whose streamed body carries an AG-UI `RUN_STARTED` event.
 * A run ends on AG-UI `RUN_FINISHED` / `RUN_ERROR` in its stream, or when the response finishes
 * (HTTP >= 400 or a failed load = error). Each logs a `step` event: run-started, run-finished,
 * run-error {message}.
 *
 * No browser network (React Native emulator demos) or a non-Chromium browser: no runs are ever
 * seen, runState() stays empty and every caller behaves as before (no-op).
 */
import { type CDPSession, type Locator, type Page } from 'playwright';
import { PROJECT } from '../config/project.config';
import { SURFACE_SELECTOR } from './timeline';
import { logStep } from './ui-log';

/** Default quiet window after a run ended before a wait gives up (TIMEOUTS.runQuietMs overrides). */
export const RUN_QUIET_MS =
  Number(process.env.RUN_QUIET_MS) || (PROJECT.timeouts as { runQuietMs?: number } | undefined)?.runQuietMs || 8000;
/** After RUN_ERROR the UI usually shows an error banner within a second or two: shorter window. */
export const RUN_ERROR_QUIET_MS = 3000;

const RUN_URL = /\/agent\/[^/?#]+\/run(\b|$)/;
const RUN_BODY = /"method"\s*:\s*"agent\/run"|generateCopilotResponse/;
const EVENT_RE = /"type"\s*:\s*"(RUN_STARTED|RUN_FINISHED|RUN_ERROR)"/g;
const MSG_RE = /"message"\s*:\s*"((?:[^"\\]|\\.){0,400})"/;

interface Run {
  url: string;
  isRun: boolean;
  startedAt: number;
  endedAt?: number;
  kind?: 'finished' | 'error';
  message?: string;
  status?: number;
  tail: string;
}

interface Watch {
  runs: Map<string, Run>;
  cdp?: CDPSession;
}

export interface RunState {
  /** A run is in flight now. */
  active: boolean;
  /** Any run seen on this page. */
  seen: boolean;
  lastStartedAt: number;
  lastFinishedAt: number;
  lastError?: { at: number; message: string };
}

export interface RunEnd {
  kind: 'finished' | 'error';
  message?: string;
  at: number;
}

const watches = new WeakMap<Page, Watch>();

/** One line, and no API key fragments (provider errors echo a masked key: sk-proj-****ABCD). */
const short = (s: string, n = 300): string =>
  s.replace(/(sk|pk|rk)-[A-Za-z0-9_*-]{6,}/g, '<key>').replace(/AIza[0-9A-Za-z_-]{10,}/g, '<key>').replace(/\s+/g, ' ').trim().slice(0, n);

function begin(run: Run): void {
  if (run.isRun) return;
  run.isRun = true;
  logStep('run-started', { url: run.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80) });
}

function end(run: Run, kind: 'finished' | 'error', message?: string): void {
  if (run.endedAt) return;
  run.endedAt = Date.now();
  run.kind = kind;
  run.message = message;
  if (!run.isRun) return;
  if (kind === 'error') logStep('run-error', { message: short(message || 'run failed') });
  else logStep('run-finished');
}

function scan(run: Run, chunk: string): void {
  const text = run.tail + chunk;
  EVENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EVENT_RE.exec(text))) {
    if (m[1] === 'RUN_STARTED') begin(run);
    else if (m[1] === 'RUN_FINISHED') { begin(run); end(run, 'finished'); }
    else {
      begin(run);
      const msg = MSG_RE.exec(text.slice(m.index, m.index + 2000));
      end(run, 'error', msg ? JSON.parse(`"${msg[1]}"`) : 'RUN_ERROR');
    }
  }
  // Keep a tail so an event split over two chunks is still seen; never re-match a whole one.
  const last = text.lastIndexOf('"type"');
  run.tail = text.slice(Math.max(last >= 0 ? last : text.length - 200, text.length - 2000));
  if (/"type"\s*:\s*"RUN_(STARTED|FINISHED|ERROR)"/.test(run.tail)) run.tail = '';
}

/** Start watching a page's run traffic. Safe to call more than once; never throws. */
export async function startRunWatch(page: Page): Promise<void> {
  if (watches.has(page)) return;
  const w: Watch = { runs: new Map() };
  watches.set(page, w);
  let cdp: CDPSession;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
  } catch {
    return; // not Chromium: no-op
  }
  w.cdp = cdp;
  cdp.on('Network.requestWillBeSent', (e: any) => {
    const req = e.request;
    if (req?.method !== 'POST' || (e.type && e.type !== 'Fetch' && e.type !== 'XHR')) return;
    const run: Run = { url: req.url, isRun: false, startedAt: Date.now(), tail: '' };
    w.runs.set(e.requestId, run);
    if (RUN_URL.test(req.url) || RUN_BODY.test(req.postData ?? '')) begin(run);
  });
  cdp.on('Network.responseReceived', (e: any) => {
    const run = w.runs.get(e.requestId);
    if (!run) return;
    run.status = e.response?.status;
    // Stream the body as it arrives (Chrome 126+); older Chromium just gets the end events.
    cdp
      .send('Network.streamResourceContent' as never, { requestId: e.requestId } as never)
      .then((r: any) => { if (r?.bufferedData) scan(run, Buffer.from(r.bufferedData, 'base64').toString('utf8')); })
      .catch(() => {});
  });
  cdp.on('Network.dataReceived', (e: any) => {
    const run = w.runs.get(e.requestId);
    if (run && e.data && !run.endedAt) scan(run, Buffer.from(e.data, 'base64').toString('utf8'));
  });
  cdp.on('Network.loadingFinished', (e: any) => {
    const run = w.runs.get(e.requestId);
    if (!run) return;
    if (run.status && run.status >= 400) end(run, 'error', `HTTP ${run.status} ${run.url.replace(/^https?:\/\/[^/]+/, '')}`);
    else end(run, 'finished');
    if (!run.isRun) w.runs.delete(e.requestId);
  });
  cdp.on('Network.loadingFailed', (e: any) => {
    const run = w.runs.get(e.requestId);
    if (!run) return;
    end(run, 'error', `request failed: ${e.errorText ?? 'unknown'}${e.canceled ? ' (canceled)' : ''}`);
    if (!run.isRun) w.runs.delete(e.requestId);
  });
}

function runsOf(page: Page): Run[] {
  return [...(watches.get(page)?.runs.values() ?? [])].filter((r) => r.isRun);
}

/** What the network says about the page's agent runs right now. */
export function runState(page: Page): RunState {
  const runs = runsOf(page);
  const errs = runs.filter((r) => r.kind === 'error').sort((a, b) => b.endedAt! - a.endedAt!);
  return {
    active: runs.some((r) => !r.endedAt),
    seen: runs.length > 0,
    lastStartedAt: Math.max(0, ...runs.map((r) => r.startedAt)),
    lastFinishedAt: Math.max(0, ...runs.filter((r) => r.endedAt).map((r) => r.endedAt!)),
    lastError: errs[0] ? { at: errs[0].endedAt!, message: short(errs[0].message ?? '') } : undefined,
  };
}

/**
 * The run(s) started at or after `sinceT` (Date.now() ms) have all ended and none is in flight:
 * how the last one ended (an error wins). Undefined while a run is active or none started yet.
 */
export function endedSince(page: Page, sinceT: number): RunEnd | undefined {
  const all = runsOf(page);
  if (all.some((r) => !r.endedAt)) return undefined;
  const mine = all.filter((r) => r.startedAt >= sinceT);
  if (!mine.length) return undefined;
  const err = mine.filter((r) => r.kind === 'error').pop();
  const lastAt = Math.max(...mine.map((r) => r.endedAt!));
  return err ? { kind: 'error', message: short(err.message ?? ''), at: lastAt } : { kind: 'finished', at: lastAt };
}

/** Resolves when a run that started after `sinceT` has ended (undefined at `timeoutMs`). */
export async function runEnded(page: Page, sinceT: number, timeoutMs = 600_000): Promise<RunEnd | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs && !page.isClosed()) {
    const e = endedSince(page, sinceT);
    if (e) return e;
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}

/** A cheap fingerprint of what the page shows (text length, surfaces, frames). */
export async function domSignature(page: Page): Promise<string> {
  return page
    .evaluate(
      (sel) => `${(document.body?.innerText || '').length}/${document.querySelectorAll(sel).length}/${document.querySelectorAll('iframe').length}`,
      SURFACE_SELECTOR,
    )
    .catch(() => '');
}

/**
 * Wait for the page's own UI (a locator to become visible, or any promise) OR give up once the
 * agent run that started after `sinceT` (default: now) has ended and the screen has not changed
 * for `quietMs`. Resolves `{ ui: value }` when the UI came, `{ ended }` when the run ended with
 * nothing new on screen (step `run-finished-nothing-rendered` / `run-error: ...` logged), or
 * `{ timeout: true }` at `timeoutMs` (the old outer cap). Never throws.
 */
export async function waitForUiOrRunEnd<T = true>(
  page: Page,
  target: Locator | Promise<T>,
  opts: { timeoutMs: number; quietMs?: number; sinceT?: number },
): Promise<{ ui?: T; ended?: RunEnd; timeout?: true }> {
  const sinceT = opts.sinceT ?? Date.now();
  const quietMs = opts.quietMs ?? RUN_QUIET_MS;
  const ui: Promise<T> =
    'waitFor' in (target as Locator) && typeof (target as Locator).waitFor === 'function'
      ? (target as Locator).waitFor({ state: 'visible', timeout: opts.timeoutMs }).then(() => true as T)
      : (target as Promise<T>);
  let done = false;
  const uiP = ui.then((v) => ({ ui: v }), () => new Promise<never>(() => {}));
  const watchP = (async () => {
    const start = Date.now();
    let sig = await domSignature(page);
    let changedAt = Date.now();
    while (!done && Date.now() - start < opts.timeoutMs && !page.isClosed()) {
      await new Promise((r) => setTimeout(r, 400));
      const now = await domSignature(page);
      if (now !== sig) { sig = now; changedAt = Date.now(); }
      const e = endedSince(page, sinceT);
      if (!e) continue;
      const q = e.kind === 'error' ? Math.min(quietMs, RUN_ERROR_QUIET_MS) : quietMs;
      if (Date.now() - Math.max(changedAt, e.at) >= q) {
        if (done) break;
        logStep(e.kind === 'error' ? `run-error: ${short(e.message || 'run failed', 160)}` : 'run-finished-nothing-rendered');
        return { ended: e };
      }
    }
    return { timeout: true as const };
  })();
  const r = await Promise.race([uiP, watchP]);
  done = true;
  return r as { ui?: T; ended?: RunEnd; timeout?: true };
}
