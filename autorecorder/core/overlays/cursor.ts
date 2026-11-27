import { type Page } from 'playwright';
import { beat, between, chance, idleRand, jitter, pause, rand, sleep } from './human';
import { currentSegment, keyframe, logAction, logMoment, timelineSeconds } from '../timeline';
import { checkExpectUi, clickTargetAt } from '../ui-log';
import { isFast } from '../fast';
import { headCutS } from '../trim-head';
import { setVoiceHeadFloor } from '../voice';

export { beat, sleep };

let globalCursorX = 960;
let globalCursorY = 540;

export function getGlobalCursorPos(): { x: number; y: number } {
  return { x: globalCursorX, y: globalCursorY };
}

export function setGlobalCursorPos(x: number, y: number): void {
  globalCursorX = x;
  globalCursorY = y;
}

/**
 * Where the cursor is when a take opens.
 *
 * Every clip used to start with it at the exact centre of the screen, which
 * is where no one's mouse ever is. Somewhere in the middle third, different
 * per take.
 */
export function restCursorSomewhere(): void {
  setGlobalCursorPos(Math.round(between(640, 1280)), Math.round(between(360, 720)));
}

async function paintCursor(page: Page, x: number, y: number): Promise<void> {
  // One round trip for the drawn cursor; the real pointer follows. Both are
  // needed: the drawn one is what the video shows, the real one drives hover
  // and drag selection.
  await page
    .evaluate(
      `(function(){var c=document.getElementById('playwright-virtual-mouse');if(c){c.style.left="${x.toFixed(1)}px";c.style.top="${y.toFixed(1)}px";}window.__arCursorPos={x:${x.toFixed(1)},y:${y.toFixed(1)}};})()`,
    )
    .catch(() => {});
  await page.mouse.move(x, y).catch(() => {});
}

/** Random source for one glide: the take's stream, or the idle stream during waits. */
type Rng = () => number;

/**
 * How long a hand takes to cover `dist` px (Fitts-like): ~250 ms at 300 px,
 * ~420 ms at 1000 px, never under 110 ms. Varied +-20% per move.
 */
export function glideDurationMs(dist: number, r: Rng = rand): number {
  const base = Math.max(110, 105 * Math.log2(dist / 40 + 1) - 75);
  return base * (0.8 + r() * 0.4);
}

const FRAME_MS = 16;

interface ArcOpts {
  /** Max bow of the path, px. */
  curve: number;
  rng: Rng;
  /** Hand tremor at low speed. Off for drags (it would wobble the selection). */
  tremor: boolean;
}

/**
 * One curved move from (sx,sy) to (tx,ty), timed by distance. Steps are fixed
 * by the (seeded) duration, so the random draws per move do not depend on how
 * fast this machine paints; only the sleep between frames does.
 */
async function arc(page: Page, sx: number, sy: number, tx: number, ty: number, o: ArcOpts): Promise<void> {
  const dist = Math.hypot(tx - sx, ty - sy);
  if (dist < 1) return;
  const durMs = glideDurationMs(dist, o.rng);
  const steps = Math.max(4, Math.round(durMs / FRAME_MS));
  const nx = -(ty - sy) / dist;
  const ny = (tx - sx) / dist;
  const bow = (o.rng() < 0.5 ? -1 : 1) * (0.3 + o.rng() * 0.7) * o.curve;
  // Control points: the bow peaks a little before the middle, like a wrist arc.
  const c1x = sx + (tx - sx) * 0.3 + nx * bow;
  const c1y = sy + (ty - sy) * 0.3 + ny * bow;
  const c2x = sx + (tx - sx) * 0.7 + nx * bow * 0.55;
  const c2y = sy + (ty - sy) * 0.7 + ny * bow * 0.55;
  const tremorAmp = 0.8 + o.rng() * 0.4;

  const t0 = Date.now();
  let px = sx;
  let py = sy;
  for (let i = 1; i <= steps; i++) {
    const r = i / steps;
    // Asymmetric speed: warp time so the peak velocity falls near 40% of the
    // move (fast launch, longer settle), then a smooth ease in/out.
    const w = r + 0.45 * r * (1 - r);
    const t = w * w * w * (w * (w * 6 - 15) + 10);
    const u = 1 - t;
    let cx = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * tx;
    let cy = u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ty;
    const jx = o.rng() - 0.5;
    const jy = o.rng() - 0.5;
    // Tremor only when the hand is slow (start and landing), never mid-flight.
    if (o.tremor && i < steps && Math.hypot(cx - px, cy - py) < 4) {
      cx += jx * 2 * tremorAmp;
      cy += jy * 2 * tremorAmp;
    }
    px = cx;
    py = cy;
    await paintCursor(page, cx, cy);
    const wait = t0 + i * FRAME_MS - Date.now();
    if (wait > 0) await sleep(wait);
  }
}

export interface GlideOptions {
  /** Pointer is held down (drag-select): near-straight path, no overshoot, no tremor. */
  drag?: boolean;
  /** Draw from the idle stream instead of the take's (moves inside open-ended waits). */
  idle?: boolean;
}

function clampToViewport(page: Page, x: number, y: number): { x: number; y: number } {
  const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
  return { x: Math.min(vp.width - 2, Math.max(2, x)), y: Math.min(vp.height - 2, Math.max(2, y)) };
}

/**
 * Human mouse move to (targetX, targetY).
 *
 * Duration follows distance (glideDurationMs), the path bows by up to
 * min(90, d*0.18) px, speed peaks early, and on longer moves the hand
 * sometimes lands 1-4% long and corrects in one or two small moves.
 *
 * `_customSteps` is kept for callers written against the old step-count API;
 * the duration now comes from the distance.
 */
export async function humanGlide(
  page: Page,
  targetX: number,
  targetY: number,
  _customSteps?: number,
  opts: GlideOptions = {},
): Promise<void> {
  if (isFast()) {
    await page.mouse.move(targetX, targetY);
    setGlobalCursorPos(targetX, targetY);
    return;
  }
  if (firstMoveS === null) {
    firstMoveS = timelineSeconds();
    setVoiceHeadFloor(headCutS(firstMoveS));
  }
  const rng: Rng = opts.idle ? idleRand : rand;
  const currentPos = (await page
    .evaluate(`
    (function() {
      var c = document.getElementById('playwright-virtual-mouse');
      if (c && c.style.left && c.style.top) {
        return { x: parseFloat(c.style.left) || ${globalCursorX}, y: parseFloat(c.style.top) || ${globalCursorY} };
      }
      return { x: ${globalCursorX}, y: ${globalCursorY} };
    })()
  `)
    .catch(() => ({ x: globalCursorX, y: globalCursorY }))) as { x: number; y: number };

  const startX = currentPos.x;
  const startY = currentPos.y;
  const distance = Math.hypot(targetX - startX, targetY - startY);

  if (distance < 2) {
    setGlobalCursorPos(targetX, targetY);
    return;
  }

  const curve = opts.drag ? Math.min(6, distance * 0.03) : Math.min(90, distance * 0.18);
  const tremor = !opts.drag;
  const overshoots = !opts.drag && distance > 150 && rng() < 0.35;
  if (overshoots) {
    const over = (0.01 + rng() * 0.03) * distance;
    const ux = (targetX - startX) / distance;
    const uy = (targetY - startY) / distance;
    const o = clampToViewport(page, targetX + ux * over + (rng() - 0.5) * 4, targetY + uy * over + (rng() - 0.5) * 4);
    await arc(page, startX, startY, o.x, o.y, { curve, rng, tremor });
    await sleep(30 + rng() * 50);
    if (rng() < 0.35) {
      // Two corrective nudges: most of the way back, a beat, then onto it.
      const mx = o.x + (targetX - o.x) * (0.6 + rng() * 0.25);
      const my = o.y + (targetY - o.y) * (0.6 + rng() * 0.25);
      await arc(page, o.x, o.y, mx, my, { curve: 2, rng, tremor });
      await sleep(20 + rng() * 40);
      await arc(page, mx, my, targetX, targetY, { curve: 1, rng, tremor });
    } else {
      await arc(page, o.x, o.y, targetX, targetY, { curve: 3, rng, tremor });
    }
  } else {
    await arc(page, startX, startY, targetX, targetY, { curve, rng, tremor });
  }

  // Exact target anchor
  await paintCursor(page, targetX, targetY);
  setGlobalCursorPos(targetX, targetY);
  await sleep(rng() * 30);
}

/**
 * Practiced human click with crisp, snappy press & release.
 *
 * The beat before the press varies: a hand hovers for a moment before it
 * commits, and not for the same moment every time.
 */
export async function humanClick(page: Page, opts: { log?: boolean; hoverMs?: [number, number] } = {}): Promise<void> {
  // Demo clicks are key moments (owner, 2026-11-25): what was clicked, a frame just before and one
  // ~0.6 s after. Doc, IDE-tab and taskbar clicks are not logged, nor the composer clicks of
  // sendPrompt (`log: false`; its `prompt-sent` step covers them).
  const demo = currentSegment() === 'demo' && opts.log !== false;
  let what = '';
  if (demo) {
    await checkExpectUi(page, 'click'); // UI that the click is about to remove (interrupt buttons)
    const { x, y } = getGlobalCursorPos();
    what = await clickTargetAt(page, x, y);
    const tag = (what.split(': ')[1] ?? what).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 24) || 'click';
    logMoment('click', { target: what || '(unknown)' }, isFast() ? undefined : `before-${tag}`);
    if (!isFast()) keyframe(`click-after-${tag}`, 800);
  }
  if (isFast()) {
    await page.mouse.down();
    await page.mouse.up();
    return;
  }
  const [lo, hi] = opts.hoverMs ?? [40, 160];
  await sleep(between(lo, hi));

  await page.evaluate(`
    (function() {
      var c = document.getElementById('playwright-virtual-mouse');
      if (c) c.style.transform = 'translate(-4px, -2px) scale(0.9)';
    })()
  `);
  await page.mouse.down();
  await sleep(between(45, 90));

  await page.evaluate(`
    (function() {
      var c = document.getElementById('playwright-virtual-mouse');
      if (c) c.style.transform = 'translate(-4px, -2px) scale(1)';
    })()
  `);
  await page.mouse.up();
  await sleep(40);
}

/**
 * The press-and-release look of a click, with no real mouse event. For drawn
 * windows that sit over a live page (Notepad): a real click there would land
 * on whatever app is underneath.
 */
export async function visualClick(page: Page): Promise<void> {
  if (isFast()) return;
  await sleep(between(40, 110));
  const set = (sc: string) =>
    page
      .evaluate(`(function(){var c=document.getElementById('playwright-virtual-mouse');if(c)c.style.transform='translate(-4px, -2px) scale(${sc})';})()`)
      .catch(() => {});
  await set('0.9');
  await sleep(between(45, 90));
  await set('1');
}

/**
 * A small, unhurried movement while nothing else is happening.
 *
 * Called from long waits -- a reply streaming for twenty seconds -- during
 * which the cursor used to sit frozen on one pixel. `driftY` biases the drift
 * downward, for following text as it arrives. Draws from the idle stream.
 */
export async function idleNudge(page: Page, driftY = 0): Promise<void> {
  if (isFast()) return;
  const { x, y } = getGlobalCursorPos();
  const nx = Math.min(1900, Math.max(20, x + (idleRand() * 2 - 1) * 15));
  const ny = Math.min(1020, Math.max(20, y + (idleRand() * 2 - 1) * 10 + driftY));
  await humanGlide(page, nx, ny, undefined, { idle: true });
}

let nextIdleAt = 0;
let lastGlanceAt = 0;

/**
 * Idle hand during an open-ended wait. Called from a polling loop; it moves
 * only when due: a small nudge (+-15 px) every 1.5-4 s, and about every 10 s
 * a "glance" of 100-300 px away and back near where it was. Idle stream only.
 */
export async function idleDrift(page: Page, driftY = 0): Promise<void> {
  if (isFast()) return;
  const now = Date.now();
  if (now < nextIdleAt) return;
  nextIdleAt = now + 1500 + idleRand() * 2500;
  if (lastGlanceAt === 0) lastGlanceAt = now;
  if (now - lastGlanceAt > 8000 + idleRand() * 4000) {
    lastGlanceAt = now;
    const { x, y } = getGlobalCursorPos();
    const ang = idleRand() * Math.PI * 2;
    const d = 100 + idleRand() * 200;
    const gx = Math.min(1880, Math.max(40, x + Math.cos(ang) * d));
    const gy = Math.min(1000, Math.max(60, y + Math.sin(ang) * d * 0.6));
    await humanGlide(page, gx, gy, undefined, { idle: true });
    await sleep(400 + idleRand() * 900);
    await humanGlide(page, x + (idleRand() - 0.5) * 30, y + (idleRand() - 0.5) * 20, undefined, { idle: true });
    return;
  }
  await idleNudge(page, driftY);
}

/** Resets the idle schedule at the start of a take. */
export function resetIdle(): void {
  nextIdleAt = 0;
  lastGlanceAt = 0;
  firstMoveS = null;
  setVoiceHeadFloor(0);
}

let firstMoveS: number | null = null;

/** When the cursor first moved in this take (s from video start), for trimming the still head. */
export function firstCursorMoveS(): number | null {
  return firstMoveS;
}

/**
 * One wheel burst as a hand turns a smooth wheel / trackpad: many small
 * events (~18 px, +-30%, ~14 ms apart, +-30%) with a bell-shaped speed --
 * slow start, fast middle, slow end (smaller steps and longer gaps at the
 * ends). The pieces add up to `total` exactly. `send` delivers one piece.
 */
export async function smoothWheelBurst(total: number, send: (delta: number) => Promise<void>): Promise<void> {
  const sign = Math.sign(total);
  const abs = Math.abs(total);
  if (abs < 1) return;
  const n = Math.max(3, Math.round(abs / 18));
  const w: number[] = [];
  for (let k = 0; k < n; k++) {
    const bell = Math.sin((Math.PI * (k + 0.5)) / n); // 0 at the ends, 1 mid-burst
    w.push((0.25 + 0.75 * bell) * (0.7 + rand() * 0.6));
  }
  const sum = w.reduce((a, b) => a + b, 0);
  let sent = 0;
  for (let k = 0; k < n; k++) {
    const piece = k === n - 1 ? abs - sent : Math.round((abs * w[k]) / sum);
    sent += piece;
    if (piece > 0) await send(sign * piece);
    const bell = Math.sin((Math.PI * (k + 0.5)) / n);
    await sleep(14 * (1.7 - 0.7 * bell) * (0.7 + rand() * 0.6));
  }
}

/**
 * Smooth, natural human scroll down the documentation page.
 *
 * In bursts, not one glide. A reader turns the wheel a few notches, stops to
 * read, turns it again — and sometimes goes back a little to re-read. One
 * continuous 3-second ease from top to target is the other thing, after
 * metronomic typing, that gives a recording away.
 *
 * Drives exactly ONE scroller per tick. Sending a wheel event *and* nudging
 * `scrollTop` (as this used to) makes the page travel roughly twice the
 * requested distance. Travel is clamped to 75% of the page so the glide never
 * bottoms out into the footer or an overscroll bounce.
 */
export async function humanScrollDown(
  page: Page,
  totalPixels: number = 1600,
  durationMs: number = 3200,
  opts: { toBottom?: boolean } = {},
): Promise<void> {
  if (isFast()) {
    await page.mouse.wheel(0, totalPixels).catch(() => {});
    return;
  }
  // Resolve the scroller once and stash it, so every tick moves the same element.
  const resolved = (await page
    .evaluate(({ requestedPixels, toBottom }) => {
      // Docs renamed their layout id (nd-docs-layout -> fd-spacious-layout, 2026-11). Try the
      // known ids, then fall back to the tallest element that actually scrolls, so a rename
      // never again leaves the skim inching 300 px at a time.
      // (No named inner functions here: tsx adds a __name helper the page doesn't have.)
      let nested: HTMLElement | undefined;
      // The left nav scrolls too and is often the tallest scroller: never pick
      // anything inside nav/aside or lying entirely left of x=300.
      // (Inlined checks, no helper functions: tsx would wrap them in a __name the page lacks.)
      for (const el of [
        document.getElementById('fd-spacious-layout'),
        document.getElementById('nd-docs-layout'),
        document.querySelector('main'),
        document.querySelector('article'),
      ]) {
        if (el instanceof HTMLElement && !el.closest('nav,aside,[role="navigation"]') && el.getBoundingClientRect().right >= 300 && el.scrollHeight > el.clientHeight + 40
          && /auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) { nested = el; break; }
      }
      if (!nested) {
        let best = 0;
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          if (!(el instanceof HTMLElement) || el.clientHeight < window.innerHeight * 0.5 || el.closest('nav,aside,[role="navigation"]') || el.getBoundingClientRect().right < 300) continue;
          const room = el.scrollHeight - el.clientHeight;
          if (room > 40 && room > best && /auto|scroll|overlay/.test(getComputedStyle(el).overflowY)) { best = room; nested = el; }
        }
      }

      (window as any).__autorecordScroller = nested ?? null;

      // Where the hand rests while wheeling: over the article text, so the
      // wheel lands on the page body and not on the sidebar.
      const art = document.querySelector('article') ?? document.querySelector('main') ?? nested;
      let point: { x: number; y: number } | null = null;
      if (art instanceof HTMLElement) {
        const r = art.getBoundingClientRect();
        const left = Math.max(r.left, 320);
        const right = Math.min(r.right, window.innerWidth - 40);
        // Not over an embedded demo (iframe) or a code box: those swallow the wheel.
        const ys = [0.5, 0.4, 0.62, 0.3, 0.72].map((f) => window.innerHeight * f);
        const xs = [0.45, 0.2, 0.75, 0.05, 0.95].map((f) => left + (right - left) * f);
        for (const y of ys) {
          for (const x of xs) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !hit.closest('iframe,pre,nav,aside,[role="navigation"]') && hit.tagName !== 'IFRAME') { point = { x, y }; break; }
          }
          if (point) break;
        }
      }

      const maxScroll = nested
        ? nested.scrollHeight - nested.clientHeight
        : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

      // `toBottom` lifts the 75% cap: the whole page, footer included.
      const cap = toBottom ? maxScroll : Math.floor(maxScroll * 0.75);
      return { px: Math.min(requestedPixels, Math.max(300, cap)), point };
    }, { requestedPixels: totalPixels, toBottom: Boolean(opts.toBottom) })
    .catch(() => ({ px: totalPixels, point: null }))) as { px: number; point: { x: number; y: number } | null };
  const actualTarget = resolved.px;
  if (resolved.point) {
    const { x, y } = getGlobalCursorPos();
    if (Math.abs(x - resolved.point.x) > 60 || Math.abs(y - resolved.point.y) > 60 || x < 300) {
      await humanGlide(page, resolved.point.x + between(-40, 40), resolved.point.y + between(-30, 30));
    }
  }

  const readPos = (): Promise<number> =>
    page
      .evaluate(() => {
        const el = (window as any).__autorecordScroller as HTMLElement | null;
        return el ? el.scrollTop : window.scrollY;
      })
      .catch(() => 0);

  // Native wheel keeps the compositor's own smoothing, so it is preferred.
  // Some doc layouts swallow it; the first tick proves which applies.
  let useWheel = true;
  let wheelProven = false;

  const tick = async (deltaY: number): Promise<void> => {
    if (useWheel) {
      const before = wheelProven ? 0 : await readPos();
      await page.mouse.wheel(0, deltaY);
      if (!wheelProven) {
        // Smooth scrolling has not moved yet right after the event: reading
        // at once saw no change and fell back to scrollTop on every take.
        await sleep(120);
        let after = await readPos();
        // A small first step may still be animating: look once more before giving up on the wheel.
        if (after === before) {
          await sleep(200);
          after = await readPos();
        }
        wheelProven = true;
        if ((deltaY > 0 && after <= before) || (deltaY < 0 && after >= before)) {
          useWheel = false;
        }
      }
    }
    if (!useWheel) {
      await page
        .evaluate((dy) => {
          const el = (window as any).__autorecordScroller as HTMLElement | null;
          if (el) el.scrollTop += dy;
          else window.scrollBy(0, dy);
        }, deltaY)
        .catch(() => {});
    }
  };

  // 3-5 bursts, each a handful of wheel notches, with a reading pause between.
  const bursts = Math.max(3, Math.min(5, Math.round(actualTarget / 420)));
  const readPauseMs = Math.max(250, (durationMs - bursts * 380) / bursts);
  let travelled = 0;

  for (let b = 0; b < bursts; b++) {
    // Content moves under a still hand: if a demo iframe or code box has
    // scrolled under the cursor, move off it before the next notches.
    {
      const { x, y } = getGlobalCursorPos();
      const blocked = await page
        .evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return !hit || hit.tagName === 'IFRAME' || Boolean(hit.closest('iframe,pre,nav,aside'));
        }, { x, y })
        .catch(() => false);
      if (blocked && resolved.point) {
        const alt = await page
          .evaluate(({ x0 }) => {
            for (const f of [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85]) {
              for (const dx of [0, -260, 260, -420, 420]) {
                const px = x0 + dx;
                const py = window.innerHeight * f;
                const hit = document.elementFromPoint(px, py);
                if (px > 300 && hit && hit.tagName !== 'IFRAME' && !hit.closest('iframe,pre,nav,aside')) return { x: px, y: py };
              }
            }
            return null;
          }, { x0: resolved.point.x })
          .catch(() => null);
        if (alt) await humanGlide(page, alt.x, alt.y);
      }
    }
    const remaining = actualTarget - travelled;
    const share = b === bursts - 1 ? remaining : Math.round((remaining / (bursts - b)) * between(0.75, 1.25));
    if (share > 0) {
      await smoothWheelBurst(share, tick);
      travelled += share;
    }
    await pause(readPauseMs, 0.4);

    // Occasionally lose the line and go back for it.
    if (b > 0 && b < bursts - 1 && chance(0.25)) {
      const back = Math.round(between(60, 140));
      await smoothWheelBurst(-back, tick);
      travelled -= back;
      await pause(500, 0.4);
    }
  }

  await sleep(jitter(300));
  logAction('scroll', useWheel ? 'wheel' : 'scrollTop', 'ok', { pixels: travelled });
}
