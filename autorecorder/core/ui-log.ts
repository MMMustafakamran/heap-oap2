/**
 * Key moments of the demo, for the reviewer (owner, 2026-11-25): steps (prompt sent, reply started /
 * finished, page waits), clicks with what was clicked, meaningful UI changes, and the UI a page is
 * expected to show (`expectUi`). All go to events.jsonl (+ a keyframe each); the probe puts them in
 * result.json. See ../SCHEMA.md.
 *
 * LOGGING ONLY, like timeline.ts: nothing here changes what the page does, retries anything or puts
 * anything on screen. The UI observer only reads the DOM. Page-side code is passed as strings: tsx
 * (esbuild keepNames) wraps named functions in __name(), which does not exist in the page.
 */
import { type Locator, type Page } from 'playwright';
import { SELECTORS } from '../config/selectors.config';
import { SURFACE_SELECTOR, checkpoint, keyframe, logMoment, timelineEvents, timelineNow } from './timeline';
import { isFast } from './fast';

/** One piece of UI the page should show once the agent has answered (PageDefinition.expectUi). */
export interface ExpectUi {
  /** Checkpoint label is `ui:<name>`. */
  name: string;
  /** Playwright selector (`text=` allowed). With `text`: an element matching both. */
  selector?: string;
  /** Visible text (substring, case-insensitive) or a RegExp. With `role`: the accessible name. */
  text?: string | RegExp;
  /** ARIA role (`button`, `alert`, `listitem` ...), matched with getByRole. */
  role?: string;
  /** Instead of an element: ok when the UI timeline logged a text change outside the chat (state panels, counters). */
  changed?: boolean;
}

const UI_CAP = 30;
const STEP_FRAME_DELAY_MS = 600;
const PROBE_MS = 3000;

let uiCount = 0;
let expected: ExpectUi[] = [];
let actionStart = 0;
const seen = new Map<string, { t: number; observed: string }>();
const hooked = new WeakSet<Page>();

const short = (s: string, n = 80): string => s.replace(/\s+/g, ' ').trim().slice(0, n);
const slug = (s: string): string => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/** A step of the page action: event `step` {label, ...fields} + a keyframe shortly after. */
export function logStep(label: string, fields: Record<string, unknown> = {}): void {
  logMoment('step', { label, ...fields }, slug(label), isFast() ? 0 : STEP_FRAME_DELAY_MS);
}

/**
 * Waits for `target` (a locator, or a Playwright selector string; `text=...` works) to be visible,
 * and logs `step` {label} when it shows or `step-missing` {label} when it times out. Never throws:
 * returns whether it showed, so the page action decides what a miss means.
 */
export async function waitStep(
  page: Page,
  target: Locator | string,
  label: string,
  opts: { timeoutMs?: number; last?: boolean } = {},
): Promise<boolean> {
  const loc = typeof target === 'string' ? page.locator(target) : target;
  const el = opts.last ? loc.last() : loc.first();
  const ok = await el
    .waitFor({ state: 'visible', timeout: opts.timeoutMs ?? 20000 })
    .then(() => true)
    .catch(() => false);
  if (ok) logStep(label);
  else logMoment('step-missing', { label }, slug(label));
  return ok;
}

/** What is under the cursor at (x, y): `<tag>: <accessible name or text>`. '' when unknown. */
export async function clickTargetAt(page: Page, x: number, y: number): Promise<string> {
  const js = `(function(){
    var el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
    if (!el) return '';
    var c = (el.closest && el.closest('button,a,[role=button],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],input,select,textarea,label,summary,[onclick]')) || el;
    var n = c.getAttribute('aria-label') || c.innerText || c.value || c.getAttribute('title') || c.getAttribute('alt') || c.getAttribute('placeholder') || '';
    n = String(n).replace(/\\s+/g, ' ').trim().slice(0, 60);
    return c.tagName.toLowerCase() + (n ? ': ' + n : '');
  })()`;
  return Promise.race([
    page.evaluate(js).then((v) => String(v ?? '')).catch(() => ''),
    new Promise<string>((r) => setTimeout(() => r(''), 1500)),
  ]);
}

// Page-side observer. cfg: { msg, chat, input, surface }. Calls window.__qaUi(json) with batches of
// { kind, text } once the DOM has been quiet ~800 ms (or every 2.5 s while it keeps changing).
const OBSERVER_JS = `(function(cfg){
  if (window.__qaUiObs) return 'already';
  var IGN = '#playwright-virtual-mouse, #win11-taskbar-overlay, [id^="__autorecord"], [id^="win11-"], [id^="ide-"]';
  var NOISE_BTN = /^(copy|copied|regenerate|retry|thumbs|like|dislike|read aloud|edit|more|send|stop|close|dismiss|scroll to bottom)\\b/i;
  var pend = [], timer = null, first = 0, seenKeys = {};
  function ign(el) { try { return !!(el.closest && el.closest(IGN)); } catch (e) { return false; } }
  function cls(el) { var c = el.className; return String(c && c.baseVal !== undefined ? c.baseVal : c || ''); }
  function spinner(el) {
    var s = cls(el) + ' ' + (el.getAttribute('data-testid') || '');
    return /spin|loading|loader|skeleton|cursor|pulse|typing|shimmer/i.test(s) || el.getAttribute('aria-busy') === 'true' || el.getAttribute('role') === 'progressbar';
  }
  function vis(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }
  function nm(el) {
    return String(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  }
  function inChat(el) { try { return !!(el.closest && (el.closest(cfg.msg) || el.closest(cfg.chat))); } catch (e) { return false; } }
  function flush() {
    timer = null; first = 0;
    if (!pend.length) return;
    var out = pend; pend = [];
    try { if (window.__qaUi) window.__qaUi(JSON.stringify(out)); } catch (e) {}
  }
  function add(kind, text) {
    text = String(text || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    var key = kind + '|' + text;
    if (seenKeys[key]) return;
    seenKeys[key] = 1;
    pend.push({ kind: kind, text: text });
    if (!first) first = Date.now();
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, Date.now() - first > 2500 ? 0 : 800);
  }
  function scan(root) {
    if (!root || root.nodeType !== 1 || ign(root)) return;
    var sel = 'button,[role=button],input,textarea,select,img,iframe,canvas,svg,[role=alert],[data-error],[class*=error],[class*=Error],nextjs-portal,' + cfg.surface;
    var list = [root].concat(Array.prototype.slice.call(root.querySelectorAll(sel), 0, 200));
    var btns = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.matches || !e.matches(sel) || ign(e) || spinner(e)) continue;
      var tag = e.tagName.toLowerCase(), role = e.getAttribute('role');
      if (tag === 'nextjs-portal') { add('error', 'next.js error overlay'); continue; }
      if (!vis(e)) continue;
      if (tag === 'button' || role === 'button') {
        var n = nm(e);
        if (n && !NOISE_BTN.test(n)) btns.push(n);
        continue;
      }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        try { if (e.matches(cfg.input)) continue; } catch (x) {}
        add('input', tag + ' ' + (e.getAttribute('type') || '') + ' ' + nm(e));
        continue;
      }
      var r = e.getBoundingClientRect();
      if (tag === 'img' || tag === 'iframe' || tag === 'canvas') {
        if (r.width * r.height < 1600) continue;
        add(tag, String(e.getAttribute('alt') || e.getAttribute('title') || e.getAttribute('src') || '').slice(0, 50) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        continue;
      }
      if (tag === 'svg') {
        if (r.width < 80 || r.height < 80 || (e.parentElement && e.parentElement.closest('svg'))) continue;
        add('svg', Math.round(r.width) + 'x' + Math.round(r.height));
        continue;
      }
      try { if (e.matches(cfg.surface)) { add('surface', (e.innerText || '').trim() || '(empty)'); continue; } } catch (x) {}
      var t = (e.innerText || '').trim();
      if (t) add('error', t);
    }
    if (btns.length) add('buttons', btns.slice(0, 6).join(', '));
    if (list.length === 1 && !inChat(root) && !root.closest('textarea,input,[contenteditable=true]') && !spinner(root) && !root.matches(sel)) {
      var tx = (root.innerText || '').trim();
      if (tx && tx.length <= 200 && vis(root)) add('text', tx);
    }
  }
  function textChange(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (!el || el.nodeType !== 1 || ign(el) || inChat(el) || spinner(el)) return;
    if (el.closest('textarea,input,[contenteditable=true],script,style')) return;
    var blk = el.closest('p,li,td,th,h1,h2,h3,h4,h5,label,pre,dd,dt,span,div') || el;
    var t = (blk.innerText || '').trim();
    if (t && t.length <= 200 && vis(blk)) add('text', t);
  }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length && i < 300; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { textChange(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length && j < 50; j++) {
        var nd = m.addedNodes[j];
        if (nd.nodeType === 3) textChange(nd); else scan(nd);
      }
    }
  });
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  window.__qaUiObs = obs;
  return 'ok';
})`;

const CHAT_SEL =
  '[class*="copilotKitMessage"], [class*="copilotKitMessages"], [class*="message-list"], [class*="messages"], [data-message-role], [data-testid*="message"], copilot-chat-message-view, copilot-chat-view';

function onUi(raw: string): void {
  let items: { kind: string; text: string }[] = [];
  try {
    items = JSON.parse(raw);
  } catch {
    return;
  }
  let logged = 0;
  for (const it of items) {
    if (uiCount >= UI_CAP) break;
    uiCount++;
    logged++;
    logMoment('ui', { ui: String(it.kind), text: short(String(it.text ?? '')) });
  }
  // One keyframe per settled batch: the observer already waited for the DOM to go quiet.
  if (logged && !isFast()) keyframe(`ui-${slug(items[0].kind)}`);
}

/**
 * Starts the UI logger on the demo page (call once the demo has loaded). Re-installs itself after a
 * reload of the same page. Never throws.
 */
export async function startUiLog(page: Page): Promise<void> {
  uiCount = 0;
  const cfg = {
    msg: SELECTORS.assistantMessage,
    chat: CHAT_SEL,
    input: SELECTORS.chatInput,
    surface: SURFACE_SELECTOR,
  };
  const install = (): Promise<unknown> =>
    page.evaluate(`${OBSERVER_JS}(${JSON.stringify(cfg)})`).catch(() => {});
  if (!hooked.has(page)) {
    hooked.add(page);
    await page.exposeFunction('__qaUi', (raw: string) => onUi(raw)).catch(() => {});
    page.on('load', () => {
      if (timelineNow()) void install();
    });
  }
  await install();
}

/** Starts a page's expected-UI checks (call before the page action). */
export function setExpectUi(list: ExpectUi[] | undefined): void {
  expected = list ?? [];
  seen.clear();
  actionStart = timelineNow();
}

async function probeOne(page: Page, item: ExpectUi): Promise<string | null> {
  if (item.changed) {
    const hit = timelineEvents().find((e) => e.kind === 'ui' && e.ui === 'text' && e.t >= actionStart);
    return hit ? `text changed: ${String(hit.text ?? '')}` : null;
  }
  let loc: Locator;
  if (item.role) {
    const base = item.selector ? page.locator(item.selector) : page;
    loc = base.getByRole(item.role as Parameters<Page['getByRole']>[0], item.text ? { name: item.text } : {});
  } else if (item.selector) {
    loc = page.locator(item.selector);
    if (item.text) loc = loc.filter({ hasText: item.text });
  } else if (item.text) {
    loc = page.getByText(item.text);
  } else {
    return null;
  }
  const n = Math.min(await loc.count().catch(() => 0), 12);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const label = await el
      .evaluate((e) => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || e.tagName).toString())
      .catch(() => 'visible');
    return short(label || 'visible', 120);
  }
  return null;
}

/**
 * Looks for each expected UI piece. `reply`: when the reply has finished (only notes what is seen,
 * with a keyframe). `end`: when the page action ends; emits one checkpoint `ui:<name>` per piece,
 * ok when seen at either moment, its `t` the first time it was seen (one checkpoint per name, so a
 * piece that only shows after a click never fails the probe early). Never throws.
 */
export async function checkExpectUi(page: Page, when: 'reply' | 'end'): Promise<void> {
  if (!expected.length || !timelineNow() || page.isClosed()) return;
  for (const item of expected) {
    if (seen.has(item.name)) continue;
    const observed = await Promise.race([
      probeOne(page, item).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), PROBE_MS)),
    ]);
    if (observed) {
      seen.set(item.name, { t: timelineNow(), observed });
      if (when === 'reply' && !isFast()) keyframe(`ui-${slug(item.name)}`);
    }
  }
  if (when !== 'end') return;
  for (const item of expected) {
    const hit = seen.get(item.name);
    const expect = describeExpect(item);
    void checkpoint(`ui:${item.name}`, expect, () => hit?.observed ?? null, hit ? { t: hit.t } : {});
  }
  expected = [];
}

function describeExpect(i: ExpectUi): string {
  if (i.changed) return 'a UI text change outside the chat';
  return [i.role && `role=${i.role}`, i.selector, i.text && `text ${String(i.text)}`].filter(Boolean).join(' ') || i.name;
}

const BTN = (re: RegExp, name = 'buttons'): ExpectUi => ({ name, role: 'button', text: re });

/** Ready-made expectUi lists per page type. Use `expectUi: expectUiFor('interrupt')` or a custom list. */
export const EXPECT_UI_TEMPLATES = {
  /** Interrupt / human-in-the-loop: approve/reject or choice buttons. */
  interrupt: [BTN(/approve|reject|accept|decline|confirm|cancel|yes|no\b|continue|submit|select|choose/i, 'choice-buttons')],
  /** Tool rendering: a tool card / generative-UI surface. */
  'tool-card': [{ name: 'tool-card', selector: `${SURFACE_SELECTOR}, [data-testid*="tool" i], [class*="tool" i][class*="card" i], [class*="ToolCall"], [class*="tool-call"]` }],
  /** A2UI: a rendered surface, or a render error on screen. */
  a2ui: [{ name: 'surface-or-error', selector: `${SURFACE_SELECTOR}, [role="alert"], [class*="error" i]` }],
  /** MCP apps / open generative UI: an iframe app. */
  iframe: [{ name: 'iframe-app', selector: 'iframe' }],
  /** Shared state: a state panel value changes outside the chat. */
  'shared-state': [{ name: 'state-change', changed: true }],
  /** Reasoning: a reasoning block or toggle. */
  reasoning: [{ name: 'reasoning', selector: '[data-testid*="reasoning" i], [class*="reasoning" i], [class*="thinking" i], details, summary', text: /reason|think|thought/i }],
  /** Sub-agents: delegation entries. */
  'sub-agents': [{ name: 'delegation', text: /delegat|sub-?agent|handoff|hand(ed)? off|transfer/i }],
  /** Multimodal: an attachment preview. */
  multimodal: [{ name: 'attachment-preview', selector: 'img[src^="blob:"], img[src^="data:"], [class*="attachment" i], [data-testid*="attachment" i], [class*="preview" i]' }],
  /** Threads: a thread list item. */
  threads: [{ name: 'thread-item', selector: '[data-testid*="thread" i], [class*="thread" i] li, [class*="thread" i] [role="listitem"], [class*="ThreadList"] > *' }],
} satisfies Record<string, ExpectUi[]>;

export type ExpectUiKind = keyof typeof EXPECT_UI_TEMPLATES;

/** The template list for a page type, optionally with extra pieces: `expectUiFor('interrupt', { name: 'card', selector: '.card' })`. */
export function expectUiFor(kind: ExpectUiKind, ...extra: ExpectUi[]): ExpectUi[] {
  return [...EXPECT_UI_TEMPLATES[kind].map((x) => ({ ...x })), ...extra];
}
