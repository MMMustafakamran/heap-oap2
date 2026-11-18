import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logEvent, timelineMarks, timelineNow } from './timeline';

// ---------------------------------------------------------------------------------------------
// Voice gate: the recorder waits before a narrated mark until the voice lines before it have
// ended, so no line runs into the next one. Placement mirrors narrate.py line_starts/resolve:
// a line starts LEAD after its mark; '+' follows the previous line FOLLOW_GAP after its voice
// ends; 'label#n' is the nth mark with that label.
// ---------------------------------------------------------------------------------------------
const LEAD = 0.6;
const FOLLOW_GAP = 0.35;
const WPS = 2.5;
const SAFETY = 0.3;

type Seg = { at: string; text: string };
type Plan = { segs: Seg[]; durs: number[] };

let plan: Plan | null = null;
let enabled = true;

/** Off in fast/probe mode: the gate never waits and Notepad holds only its dwell. */
export function setVoiceEnabled(on: boolean): void {
  enabled = on;
}

const words = (t: string): number => (t.match(/[A-Za-z0-9']+/g) ?? []).length;

function readJson(p: string): any {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Finds the take's script: first a narration/scripts/*.json whose "page" == pageId (survives clip
 * renumbering), else narration/scripts/<clip>.json. Null plan when neither exists.
 */
export function loadVoicePlan(root: string, pageId: string, clip: string): void {
  plan = null;
  const dir = join(root, 'narration', 'scripts');
  if (!existsSync(dir)) return;
  let script: any = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const s = readJson(join(dir, f));
    if (s && s.page === pageId) { script = s; break; }
  }
  script ??= readJson(join(dir, `${clip}.json`));
  const segs: Seg[] = Array.isArray(script?.segments) ? script.segments : [];
  if (!segs.length) return;
  const dur = new Map<string, number>();
  const audioDir = join(root, 'narration', 'audio');
  // Same source as narrate.py fit: only metas for today's model and voice reference count.
  const model = process.env.FISH_MODEL || 's2.1-pro-free';
  const ref = String(readJson(join(root, 'narration', 'voice.json'))?.refSha256 ?? '').trim().toLowerCase();
  if (ref && existsSync(audioDir)) {
    for (const f of readdirSync(audioDir)) {
      if (!f.endsWith('.json')) continue;
      const a = readJson(join(audioDir, f));
      if (a?.text && a?.duration && a.model === model && String(a.refSha256 ?? '').toLowerCase() === ref) dur.set(a.text, a.duration);
    }
  }
  plan = { segs, durs: segs.map((s) => dur.get(s.text) ?? words(s.text) / WPS) };
}

function resolve(key: string): number | null {
  const [label, n] = key.split('#');
  const hits = timelineMarks().filter((m) => m.label === label);
  const i = Number(n || 1) - 1;
  return i < hits.length ? hits[i].t : null;
}

/** Voice end (s, timeline clock) of each line before `upto`; null for lines whose mark hasn't fired. */
function ends(p: Plan, upto: number): (number | null)[] {
  const starts: (number | null)[] = [];
  const out: (number | null)[] = [];
  for (let i = 0; i < upto; i++) {
    const s = p.segs[i].at === '+'
      ? (i > 0 && starts[i - 1] != null ? starts[i - 1]! + p.durs[i - 1] + FOLLOW_GAP : null)
      : resolve(p.segs[i].at);
    starts.push(s);
    out.push(s == null ? null : s + LEAD + p.durs[i]);
  }
  return out;
}

/**
 * Call right before mark(nextLabel). If a script line attaches to this occurrence of nextLabel,
 * waits until every earlier line has ended (+0.3 s) and logs a `voice-wait` event.
 */
export async function voiceGate(nextLabel: string): Promise<void> {
  if (!plan || !enabled || !timelineNow()) return;
  const n = timelineMarks().filter((m) => m.label === nextLabel).length + 1;
  const j = plan.segs.findIndex((s) => s.at === `${nextLabel}#${n}` || (n === 1 && s.at === nextLabel));
  if (j <= 0) return;
  const last = Math.max(...ends(plan, j).map((e) => e ?? 0));
  const ms = Math.round((last + SAFETY - timelineNow()) * 1000);
  if (ms <= 0) return;
  logEvent('voice-wait', { label: nextLabel, ms });
  await new Promise((r) => setTimeout(r, ms));
}

/** Milliseconds the Notepad voice-over runs, from the `notepad` mark (+ a beat); 0 when unknown. */
export function notepadVoiceMs(): number {
  if (!plan || !enabled) return 0;
  const i = plan.segs.findIndex((s) => s.at === 'notepad');
  if (i < 0) return 0;
  let s = LEAD + plan.durs[i];
  for (let k = i + 1; k < plan.segs.length && plan.segs[k].at === '+'; k++) s += FOLLOW_GAP + plan.durs[k];
  return Math.round((s + 1.2) * 1000); // a beat after the last word before the window closes
}

/** Call before the clip ends: waits until every script line has ended (+0.3 s), so no take cuts off the last line. */
export async function voiceTail(): Promise<void> {
  if (!plan || !enabled || !timelineNow()) return;
  const last = Math.max(0, ...ends(plan, plan.segs.length).map((e) => e ?? 0));
  const ms = Math.round((last + SAFETY - timelineNow()) * 1000);
  if (ms <= 0) return;
  logEvent('voice-wait', { label: 'end', ms });
  await new Promise((r) => setTimeout(r, ms));
}
