import { type BrowserContext, type Locator, type Page } from 'playwright';
import { logAction } from '../timeline';
import { isFast } from '../fast';
import { getGlobalCursorPos, humanClick, humanGlide, sleep } from './cursor';
import { between } from './human';

/**
 * Height of the simulated Windows 11 taskbar, in CSS pixels.
 *
 * The overlay is `position:fixed; bottom:0`, so in a 1080-tall viewport it owns
 * y >= 1032 and swallows pointer events there. Anything the recorder needs to
 * click must sit above that line -- see `ensureClearOfTaskbar`.
 */
export const TASKBAR_HEIGHT = 48;

/**
 * Scroll a control clear of the taskbar overlay before clicking it.
 *
 * A page whose input row sits at the bottom of the viewport ends up underneath
 * the taskbar, and the click lands on the overlay instead of the control. That
 * is a defect of the recorder's own furniture, not of the page being recorded,
 * so it is corrected here rather than by moving the element in the app.
 *
 * Two steps, because the first is not always enough:
 *  1. scroll the element up by however much of it is covered
 *  2. if the document cannot scroll any further, add matching bottom padding so
 *     that it can, then scroll again
 *
 * Padding is applied to `document.body` and left in place for the rest of the
 * take -- it keeps the page clear of the taskbar rather than shifting mid-shot.
 *
 * @param margin extra clearance above the taskbar, in pixels
 * @returns true if the element ended up fully clear
 */
export async function ensureClearOfTaskbar(
  page: Page,
  locator: Locator,
  margin = 16,
): Promise<boolean> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  const overlapOf = async (): Promise<number> => {
    const box = await locator.boundingBox();
    if (!box) return 0;
    const viewportHeight = page.viewportSize()?.height ?? 1080;
    const safeBottom = viewportHeight - TASKBAR_HEIGHT - margin;
    return Math.max(0, box.y + box.height - safeBottom);
  };

  let overlap = await overlapOf();
  if (overlap <= 0) return true;

  // 1. Try scrolling the page itself.
  await page.evaluate((delta) => window.scrollBy(0, delta), overlap);
  await sleep(250);

  overlap = await overlapOf();
  if (overlap <= 0) return true;

  // 2. Already at the bottom -- make room, then take up the slack.
  await page.evaluate(
    ({ pad }) => {
      const body = document.body;
      const current = parseFloat(body.style.paddingBottom || '0') || 0;
      body.style.paddingBottom = `${current + pad}px`;
    },
    { pad: overlap + margin },
  );
  await sleep(200);
  await page.evaluate((delta) => window.scrollBy(0, delta), overlap + margin);
  await sleep(250);

  return (await overlapOf()) <= 0;
}

/**
 * Waits until the page's framework has finished hydrating.
 *
 * Next.js App Router renders `<html>` itself, so React owns
 * `document.documentElement`. Anything appended to `<html>` before hydration
 * completes is an unexpected child, and React deletes it when it reconciles --
 * which is what silently removed the taskbar and the cursor partway through the
 * doc page, and reset the page's scroll back to the top along with them.
 *
 * Detected directly rather than guessed at: drop a sentinel into `<html>` and
 * wait for React to delete it. Measured at ~4.5s after DOMContentLoaded on
 * docs.copilotkit.ai, which is precisely when the overlays used to vanish.
 *
 * @returns true if hydration was observed, false on timeout (a page that never
 *   hydrates -- e.g. the static IDE view -- would always time out, so do not
 *   call this for one).
 */
export async function waitForHydration(
  page: Page,
  timeoutMs = 8000,
): Promise<boolean> {
  return page
    .evaluate(async (timeout) => {
      const probe = document.createElement('div');
      probe.id = '__autorecord_hydration_probe';
      probe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:0;height:0;pointer-events:none;';
      document.documentElement.appendChild(probe);

      const started = Date.now();
      while (Date.now() - started < timeout) {
        if (!probe.isConnected) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      probe.remove();
      return false;
    }, timeoutMs)
    .catch(() => false);
}

/**
 * Windows the recorder can switch between, and the DOM ids their tiles use.
 *
 * A table rather than branches: the active-app styling is applied in three
 * separate places (initial paint, re-attach after a React render, and the click
 * handler), and every one of them used to name chrome and vscode explicitly.
 * Adding the terminal that way would have meant nine edits and a fourth window
 * nine more.
 */
export const TASKBAR_APPS = {
  chrome: {
    tileId: 'win11-taskbar-chrome',
    indicatorId: 'win11-chrome-indicator',
    // Offset from centre, used only if the tile cannot be measured: tiles are
    // 44px on a 4px gap, so each one sits 48px right of the last.
    fallbackOffsetX: 24,
  },
  vscode: {
    tileId: 'win11-taskbar-vscode',
    indicatorId: 'win11-vscode-indicator',
    fallbackOffsetX: 72,
  },
  terminal: {
    tileId: 'win11-taskbar-terminal',
    indicatorId: 'win11-terminal-indicator',
    fallbackOffsetX: 168,
  },
} as const;

export type TaskbarApp = keyof typeof TASKBAR_APPS;

const ACTIVE_TILE_BG = 'rgba(255,255,255,0.06)';
const ACTIVE_INDICATOR = '#4cc2ff';
const IDLE_INDICATOR = 'rgba(255,255,255,0.45)';

/** Virtual paths of the in-memory IDE and terminal windows (engine.ts serves them). */
export const IDE_ROUTE_PATH = '/__autorecord_ide__';
export const TERMINAL_ROUTE_PATH = '/__autorecord_terminal__';

/** JS that paints every tile for the given active app. Used by both code paths. */
function applyActiveAppJs(activeApp: TaskbarApp): string {
  return Object.entries(TASKBAR_APPS)
    .map(([app, { tileId, indicatorId }]) => {
      const isActive = app === activeApp;
      return `
        (function() {
          var tile = document.getElementById('${tileId}');
          var ind = document.getElementById('${indicatorId}');
          if (tile) tile.style.backgroundColor = '${isActive ? ACTIVE_TILE_BG : 'transparent'}';
          if (ind) {
            ind.style.background = '${isActive ? ACTIVE_INDICATOR : IDLE_INDICATOR}';
            ind.style.width = '${isActive ? '16px' : '6px'}';
          }
        })();`;
    })
    .join('');
}

/* Taskbar icons: simple shapes drawn for this recorder, no product artwork copied. */
const ICON_NOTEPAD =
  '<svg width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="arNpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0ff"/><stop offset="1" stop-color="#2b9de6"/></linearGradient></defs>' +
  '<rect x="4" y="3.5" width="16" height="18" rx="2.2" fill="url(#arNpG)"/><rect x="5.3" y="6.6" width="13.4" height="13.6" rx="1.2" fill="#f4fbff"/>' +
  '<path d="M7.5 10h9M7.5 12.8h9M7.5 15.6h6" stroke="#5aa9db" stroke-width="1.1" stroke-linecap="round"/>' +
  '<path d="M8 2.6v2.8M12 2.6v2.8M16 2.6v2.8" stroke="#1d5f93" stroke-width="1.5" stroke-linecap="round"/></svg>';

const ICON_TERMINAL =
  '<svg width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="arTmG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5b5b"/><stop offset="1" stop-color="#2a2a2a"/></linearGradient></defs>' +
  '<rect x="2.5" y="3.5" width="19" height="17" rx="3" fill="#1b1b1b" stroke="url(#arTmG)" stroke-width="1.2"/>' +
  '<rect x="2.5" y="3.5" width="19" height="3.6" rx="1.6" fill="#3a3a3a"/>' +
  '<path d="m6.6 10.4 3.3 2.7-3.3 2.7" stroke="#ececec" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
  '<path d="M11.6 16.6h5.4" stroke="#bdbdbd" stroke-width="1.7" stroke-linecap="round"/></svg>';

const ICON_COPILOT =
  '<svg width="24" height="24" viewBox="0 0 24 24"><defs>' +
  '<linearGradient id="arCpA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fb3ff"/><stop offset="1" stop-color="#2167e8"/></linearGradient>' +
  '<linearGradient id="arCpB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb357"/><stop offset=".55" stop-color="#f6577c"/><stop offset="1" stop-color="#b44ff0"/></linearGradient></defs>' +
  '<path d="M7.2 4.2h6.6c1.2 0 2 .7 1.6 1.9l-3.6 11.2c-.4 1.2-1.4 2.5-3.2 2.5H5.2c-1.3 0-2-.8-1.6-2l3.5-11.1c.2-1.4.9-2.5 2.1-2.5z" fill="url(#arCpA)" opacity=".95"/>' +
  '<path d="M10.6 4.2h6.2c1.6 0 2.6 1.1 2.1 2.7l-3.3 10.6c-.5 1.6-1.6 2.3-2.9 2.3H6.5c1.4 0 2.4-1 2.8-2.3l3.5-11.1c.3-1.3-.5-2.2-2.2-2.2z" fill="url(#arCpB)" opacity=".92"/></svg>';

/**
 * Builds (or repaints) the taskbar and the drawn cursor. Defined as a page
 * function so the same code runs from the context init script (first frame of
 * every navigation) and from ensureOverlays (repaint after load).
 */
function overlayBuilderJs(): string {
  const tile = (id: string, inner: string, indId?: string): string =>
    `'<div id="${id}" style="width:44px;height:40px;display:flex;align-items:center;justify-content:center;position:relative;border-radius:4px;">${inner}` +
    (indId
      ? `<div id="${indId}" style="position:absolute;bottom:1px;width:6px;height:3px;background:${IDLE_INDICATOR};border-radius:2px;transition:width .2s ease,background .2s ease;"></div>`
      : '') +
    `</div>'`;
  const tiles = [
    tile(
      'win11-taskbar-start',
      '<svg width="22" height="22" viewBox="0 0 24 24"><defs><linearGradient id="w11s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4cc2ff"/><stop offset="1" stop-color="#0f6cbd"/></linearGradient></defs><rect x="2.5" y="2.5" width="8.6" height="8.6" rx="0.6" fill="url(#w11s)"/><rect x="12.9" y="2.5" width="8.6" height="8.6" rx="0.6" fill="url(#w11s)"/><rect x="2.5" y="12.9" width="8.6" height="8.6" rx="0.6" fill="url(#w11s)"/><rect x="12.9" y="12.9" width="8.6" height="8.6" rx="0.6" fill="url(#w11s)"/></svg>',
    ),
    tile(
      'win11-taskbar-search',
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" stroke-width="1.9" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>',
    ),
    tile(
      'win11-taskbar-taskview',
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="11" height="12" rx="2" stroke="#e5e5e5" stroke-width="1.6"/><rect x="10" y="8" width="11" height="12" rx="2" fill="#2b2b2b" stroke="#e5e5e5" stroke-width="1.6"/></svg>',
    ),
    tile(
      'win11-taskbar-explorer',
      '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h5.2l2 2H20a1.5 1.5 0 0 1 1.5 1.5V9H2.5V5.5z" fill="#e39b1e"/><rect x="4.5" y="8" width="13" height="4" rx="0.6" fill="#3d8fe0"/><rect x="5.5" y="9" width="11" height="2.5" rx="0.4" fill="#e9f2fb"/><path d="M2.5 9.5h19v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9z" fill="#f9c43c"/><path d="M2.5 11h19v7.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V11z" fill="#ffd45c"/></svg>',
      'win11-explorer-indicator',
    ),
    tile(
      'win11-taskbar-chrome',
      '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#ffffff"/><path fill="#ea4335" d="M12 1.5C8.1 1.5 4.7 3.6 2.9 6.8l4.6 8 .1-.1A5.5 5.5 0 0 1 12 6.5h9.6A10.5 10.5 0 0 0 12 1.5z"/><path fill="#fbbc04" d="M21.6 6.5H12a5.5 5.5 0 0 1 4.8 8.2l-4.7 8.1c5.8-.1 10.4-4.7 10.4-10.4 0-2.1-.6-4.1-1.7-5.7l.8-.2z"/><path fill="#34a853" d="M7.5 14.8 2.9 6.8A10.5 10.5 0 0 0 12.1 22.8l4.7-8.1a5.5 5.5 0 0 1-9.3.1z"/><circle cx="12" cy="12" r="4.2" fill="#ffffff"/><circle cx="12" cy="12" r="3.3" fill="#4285f4"/></svg>',
      'win11-chrome-indicator',
    ),
    tile(
      'win11-taskbar-vscode',
      '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#0065a9" d="M17.6 1.8 8.2 10.4 4.3 7.4 2.2 8.4v7.2l2.1 1 3.9-3 9.4 8.6 4.2-2V3.8l-4.2-2z"/><path fill="#007acc" d="M17.6 1.8 8.2 10.4l3.1 2.9 6.3-4.8v-6.7z"/><path fill="#1f9cf0" d="M17.6 22.2 8.2 13.6l3.1-2.9 6.3 4.8v6.7z"/><path fill="#0065a9" d="m2.2 8.4 2.1-1 6.5 4.6-6.5 4.6-2.1-1V8.4z"/></svg>',
      'win11-vscode-indicator',
    ),
    tile('win11-taskbar-notepad', ICON_NOTEPAD, 'win11-notepad-indicator'),
    tile('win11-taskbar-terminal', ICON_TERMINAL, 'win11-terminal-indicator'),
    tile('win11-taskbar-copilot', ICON_COPILOT),
  ].join(',\n');

  return `
  window.__arBuildOverlays = function (activeApp, curX, curY) {
    if (window.top !== window) return;
    var root = document.documentElement;
    if (!root) return;
    var bar = document.getElementById('win11-taskbar-overlay') || window.__autorecordBar;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'win11-taskbar-overlay';
      bar.style.cssText = 'position:fixed!important;bottom:0!important;left:0!important;width:100vw!important;height:48px!important;background:rgba(32,32,32,0.85)!important;backdrop-filter:blur(30px) saturate(150%)!important;-webkit-backdrop-filter:blur(30px) saturate(150%)!important;border-top:1px solid rgba(255,255,255,0.08)!important;box-shadow:none!important;z-index:2147483645!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 8px 0 12px!important;box-sizing:border-box!important;font-family:"Segoe UI Variable Small","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,sans-serif!important;user-select:none!important;pointer-events:auto!important;';
      var swallow = function (e) { if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); };
      bar.addEventListener('mousedown', swallow, true);
      bar.addEventListener('mouseup', swallow, true);
      bar.addEventListener('click', swallow, true);
      bar.innerHTML = [
        '<div style="display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:4px;cursor:default;">',
        '  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" fill="#f59e0b"/><path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round"/></svg>',
        '  <div style="display:flex;flex-direction:column;line-height:1.15;"><span style="font-size:12px;color:#f3f3f3;">76°F</span><span style="font-size:11px;color:#a8a8a8;">Mostly sunny</span></div>',
        '</div>',
        '<div id="win11-taskbar-center-icons" style="display:flex;align-items:center;gap:4px;position:absolute;left:50%;transform:translateX(-50%);">',
        ${tiles},
        '</div>',
        '<div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#f3f3f3;">',
        '  <div style="width:24px;height:40px;display:flex;align-items:center;justify-content:center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d6d6d6" stroke-width="2.2" stroke-linecap="round"><path d="m18 15-6-6-6 6"/></svg></div>',
        '  <div style="padding:0 6px;font-size:12px;color:#f3f3f3;line-height:1.15;text-align:center;">ENG<br><span style="font-size:11px;color:#bdbdbd;">US</span></div>',
        '  <div style="display:flex;align-items:center;gap:9px;padding:0 8px;height:40px;">',
        '    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0f0f0" stroke-width="2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>',
        '    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f0f0f0" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
        '    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f0f0f0" stroke-width="1.6"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2" stroke-linecap="round"/><rect x="4" y="9" width="11" height="6" fill="#f0f0f0" stroke="none" rx="1"/></svg>',
        '  </div>',
        '  <div style="display:flex;flex-direction:column;align-items:flex-end;line-height:1.2;padding:0 8px;">',
        '    <span id="win11-time" style="font-size:12px;color:#f3f3f3;"></span>',
        '    <span id="win11-date" style="font-size:12px;color:#f3f3f3;"></span>',
        '  </div>',
        '  <div style="width:30px;height:40px;display:flex;align-items:center;justify-content:center;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e0e0e0" stroke-width="1.8" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>',
        '  <div style="width:6px;height:40px;border-left:1px solid rgba(255,255,255,0.12);"></div>',
        '</div>'
      ].join('');
      var tick = function () {
        var now = new Date();
        var t = document.getElementById('win11-time');
        var d = document.getElementById('win11-date');
        if (t) t.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        if (d) d.textContent = now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
      };
      tick();
      setInterval(tick, 1000);
    }
    if (!bar.isConnected) root.appendChild(bar);
    window.__autorecordBar = bar;
    window.__arPaintActive(activeApp);

    if (!window.__autorecordOverlayGuard && window.MutationObserver) {
      window.__autorecordOverlayGuard = new MutationObserver(function () {
        var b = window.__autorecordBar;
        var c = window.__autorecordCursor;
        if (b && !b.isConnected) document.documentElement.appendChild(b);
        if (c && !c.isConnected) document.documentElement.appendChild(c);
      });
      window.__autorecordOverlayGuard.observe(root, { childList: true });
    }

    var cursor = document.getElementById('playwright-virtual-mouse') || window.__autorecordCursor;
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'playwright-virtual-mouse';
      cursor.style.cssText = 'position:fixed!important;width:24px!important;height:24px!important;z-index:2147483647!important;pointer-events:none!important;transform:translate(-4px,-2px)!important;transform-origin:4px 2px!important;transition:transform 0.04s ease-out!important;';
      cursor.style.left = curX + 'px';
      cursor.style.top = curY + 'px';
      cursor.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.28));"><path d="M4 2 L4 19.1 L8.4 15.1 L11.2 21.2 L14 19.9 L11.3 14.1 L17.2 14.1 Z" fill="#ffffff" stroke="#2b2b2b" stroke-width="1" stroke-linejoin="round"/></svg>';
    }
    if (!cursor.isConnected) root.appendChild(cursor);
    window.__autorecordCursor = cursor;
  };
  window.__arPaintActive = function (activeApp) {
    ${Object.keys(TASKBAR_APPS)
      .map((a) => `if (activeApp === '${a}') { ${applyActiveAppJs(a as TaskbarApp)} }`)
      .join('\n    ')}
  };
  `;
}

/**
 * Context init script: the taskbar and cursor are on the very first painted
 * frame of every navigation, instead of being injected after load (which
 * showed a bare frame, then the furniture popping in). The window kind comes
 * from the URL; the in-memory IDE and terminal windows also get a dark
 * background from the first frame, so a switch never flashes white.
 */
function overlayInitScript(): string {
  return `(function () {
    try {
      if (window.top !== window) return;
      ${overlayBuilderJs()}
      var path = location.pathname || '';
      var app = path.indexOf('${IDE_ROUTE_PATH}') === 0 ? 'vscode' : path.indexOf('${TERMINAL_ROUTE_PATH}') === 0 ? 'terminal' : 'chrome';
      if (app !== 'chrome' && document.documentElement) document.documentElement.style.background = '${'#181818'}';
      var pos = window.__arCursorInit || { x: 960, y: 540 };
      window.__arBuildOverlays(app, pos.x, pos.y);
      // Re-attach once the parser has built <body>, in case it replaced anything.
      document.addEventListener('DOMContentLoaded', function () {
        var p = window.__arCursorInit || pos;
        window.__arBuildOverlays(app, p.x, p.y);
      });
    } catch (e) {}
  })();`;
}

let navSeq = 0;
const initInstalled = new WeakSet<BrowserContext>();

/** Installs the first-frame overlay script on a recording context. Once per context. */
export async function installOverlayInitScript(context: BrowserContext): Promise<void> {
  if (isFast() || initInstalled.has(context)) return;
  initInstalled.add(context);
  await context.addInitScript({ content: overlayInitScript() });
}

/**
 * Tells the next navigation where the drawn cursor is, so it appears at the
 * same spot on the new window's first frame. Init scripts pile up per page and
 * their order is not guaranteed, so each carries a sequence number and only
 * the newest one wins; it also moves an already-built cursor.
 */
export async function carryCursorToNextPage(page: Page): Promise<void> {
  if (isFast()) return;
  const { x, y } = getGlobalCursorPos();
  const seq = ++navSeq;
  await page
    .addInitScript({
      content: `(function(){var c=window.__arCursorInit;if(c&&c.seq>${seq})return;window.__arCursorInit={x:${x.toFixed(1)},y:${y.toFixed(1)},seq:${seq}};var el=document.getElementById('playwright-virtual-mouse');if(el){el.style.left='${x.toFixed(1)}px';el.style.top='${y.toFixed(1)}px';}})();`,
    })
    .catch(() => {});
}

/** Injects or re-attaches the Windows 11 Taskbar & Virtual Mouse overlay onto the current page */
export async function ensureOverlays(
  page: Page,
  activeApp: TaskbarApp = 'chrome',
): Promise<void> {
  if (isFast()) return; // probe: no taskbar
  const { x: curX, y: curY } = getGlobalCursorPos();

  const code = `
    (function() {
      // Keep the Next.js dev indicator above the 48px taskbar.
      var elevateBadges = function() {
        var portals = document.querySelectorAll('nextjs-portal');
        for (var i = 0; i < portals.length; i++) {
          var p = portals[i];
          if (p.shadowRoot) {
            var ind = p.shadowRoot.querySelector('#devtools-indicator, [data-nextjs-toast]');
            if (ind) ind.style.bottom = '56px';
          }
        }
      };
      elevateBadges();
      setTimeout(elevateBadges, 500);
      setTimeout(elevateBadges, 1500);
      if (!window.__arBuildOverlays) { ${overlayBuilderJs()} }
      window.__arBuildOverlays('${activeApp}', ${curX.toFixed(1)}, ${curY.toFixed(1)});
    })();
  `;

  await page.evaluate(code);
}

/**
 * Glides to a taskbar tile, clicks it and lights its indicator.
 *
 * `navigate`, when given, starts right at the click (the window switch begins
 * when the button is pressed, not after a pause) and is awaited before this
 * returns.
 */
export async function clickTaskbarApp(
  page: Page,
  targetApp: TaskbarApp,
  navigate?: () => Promise<unknown>,
): Promise<void> {
  if (isFast()) {
    if (navigate) await navigate();
    return; // probe: no taskbar
  }
  const targetId = TASKBAR_APPS[targetApp].tileId;

  const coords = (await page.evaluate(`
    (function() {
      var el = document.getElementById('${targetId}');
      if (el) {
        var rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return {
        x: window.innerWidth / 2 + (${TASKBAR_APPS[targetApp].fallbackOffsetX}),
        y: window.innerHeight - 24,
      };
    })()
  `)) as { x: number; y: number };

  // Aim somewhere on the icon, not its exact centre pixel.
  await humanGlide(page, coords.x + between(-6, 6), coords.y + between(-5, 5));

  await page.evaluate(`
    (function() {
      var el = document.getElementById('${targetId}');
      if (el) el.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
    })()
  `);

  await humanClick(page, { hoverMs: [60, 120], log: false });

  await page.evaluate(`
    (function() {
      ${applyActiveAppJs(targetApp)}
    })()
  `);

  logAction('click', `taskbar:${targetApp}`);
  // Whatever loads next shows the cursor where the hand left it, from its first frame.
  await carryCursorToNextPage(page);
  if (navigate) await navigate();
  else await sleep(120);
}
