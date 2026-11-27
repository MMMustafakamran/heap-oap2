/**
 * Cuts the dead head off a saved take.
 *
 * A take used to open on a still doc page for ~6 s (navigation, a second
 * navigation, waiting for the content) before the cursor first moved. After
 * the clip is saved, the video is cut to start ~1 s before that first move,
 * and every time in <clip>.timeline.json and <clip>.events.jsonl moves back by
 * the same amount (negative times clamp to 0). Never fails the take: on any
 * error it logs and leaves the untrimmed clip in place.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const LEAD_S = 1.0;
const MIN_CUT_S = 0.4;

function shiftTimes(value: unknown, cut: number): void {
  if (Array.isArray(value)) {
    for (const v of value) shiftTimes(v, cut);
    return;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.t === 'number') o.t = Math.max(0, Math.round((o.t - cut) * 1000) / 1000);
    for (const k of Object.keys(o)) if (k !== 't' && typeof o[k] === 'object') shiftTimes(o[k], cut);
  }
}

function clampTimes(value: unknown, cap: number): void {
  if (!Array.isArray(value)) return;
  for (const v of value) if (v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'number' && (v as { t: number }).t > cap) (v as { t: number }).t = cap;
}

function probeDurationS(file: string): number | undefined {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 30_000 });
    const d = parseFloat(out.trim());
    return Number.isFinite(d) && d > 0 ? d : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param webm the saved clip
 * @param firstMoveS seconds from video start to the first cursor move (null: unknown, no trim)
 * @returns seconds cut (0 when nothing was cut)
 */
/** Seconds trimHead will cut for this first move (0: none). Also read by voice.ts while recording. */
export function headCutS(firstMoveS: number | null): number {
  if (firstMoveS == null || !Number.isFinite(firstMoveS)) return 0;
  const cut = Math.round((firstMoveS - LEAD_S) * 100) / 100;
  return cut < MIN_CUT_S ? 0 : cut;
}

export function trimClipHead(webm: string, firstMoveS: number | null): number {
  const cut = headCutS(firstMoveS);
  if (!cut || firstMoveS == null) return 0;
  const tmp = webm.replace(/\.webm$/, '.trim.webm');
  try {
    // Re-encoded (VP8, like the recorder's own output): a stream copy can only
    // start on a keyframe, and Playwright's webm has few of them.
    execFileSync(
      'ffmpeg',
      ['-y', '-v', 'error', '-ss', cut.toFixed(2), '-i', webm, '-an', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '8', '-b:v', '8M', tmp],
      { stdio: 'ignore', timeout: 600_000 },
    );
    if (!existsSync(tmp)) throw new Error('ffmpeg wrote nothing');
    rmSync(webm, { force: true });
    renameSync(tmp, webm);

    const tl = webm.replace(/\.webm$/, '.timeline.json');
    if (existsSync(tl)) {
      const doc = JSON.parse(readFileSync(tl, 'utf8')) as Record<string, unknown>;
      for (const k of ['marks', 'checkpoints', 'keyframes']) shiftTimes(doc[k], cut);
      if (typeof doc.durationS === 'number') doc.durationS = Math.max(0, Math.floor((doc.durationS - cut) * 10) / 10);
      doc.trimmedHeadS = cut;
      // The end clamp (saveTimeline) still holds on the trimmed file: nothing past its real end.
      const real = probeDurationS(webm);
      if (real) {
        const cap = Math.floor(real * 10) / 10;
        for (const k of ['marks', 'checkpoints', 'keyframes']) clampTimes(doc[k], cap);
        if (typeof doc.durationS === 'number' && doc.durationS > cap) doc.durationS = cap;
      }
      writeFileSync(tl, JSON.stringify(doc, null, 2));
    }
    const ev = webm.replace(/\.webm$/, '.events.jsonl');
    if (existsSync(ev)) {
      const lines = readFileSync(ev, 'utf8').split('\n').filter((l) => l.trim());
      const out = lines.map((l) => {
        try {
          const e = JSON.parse(l);
          shiftTimes(e, cut);
          return JSON.stringify(e);
        } catch {
          return l;
        }
      });
      writeFileSync(ev, out.join('\n') + (out.length ? '\n' : ''));
    }
    console.log(`   ✂️  Trimmed ${cut.toFixed(1)}s of still head (first cursor move at ${firstMoveS.toFixed(1)}s).`);
    return cut;
  } catch (e) {
    rmSync(tmp, { force: true });
    console.warn(`   Trim note: head not trimmed, clip kept as recorded (${e instanceof Error ? e.message : e})`);
    return 0;
  }
}
