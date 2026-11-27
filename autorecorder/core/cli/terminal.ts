/**
 * Renders a captured cast as a Windows Terminal window the recorder can film.
 *
 * The page is entirely self-contained: xterm.js and its stylesheet are inlined
 * from `node_modules` rather than pulled from a CDN. The recorder must work
 * offline and produce byte-identical frames on every run, and a CDN gives up
 * both — a slow fetch shows an empty window for the first second of the video,
 * and a version bump changes the rendering underneath a suite of recordings
 * nobody re-watched.
 *
 * Replay is driven by the page, not by Playwright: writing bytes one event at a
 * time over CDP would put a round trip between every character and turn a
 * 3-minute cast into something much longer and visibly jerky. The engine starts
 * the replay and waits for it to finish.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { type Cast } from './cast';
import { monoFontFace, MONO_STACK, UI_STACK } from '../assets/fonts';

const require = createRequire(import.meta.url);

export interface TerminalRenderOptions {
  /** The cast to replay. Compress it before passing it in, not after. */
  cast: Cast;

  /** Title-bar text. Defaults to the cast's own title. */
  title?: string;

  /** Terminal font size in px. */
  fontSize?: number;

  /** Beat before the first byte, so the window is on screen before it fills. */
  startDelayMs?: number;

  /** Hold on the final frame, so the last output is readable before cutting. */
  endHoldMs?: number;

  /** Live shell (failure terminal): a large window over the other apps, grid fitted to it via __termFit. */
  live?: boolean;

  /** Live mode: image of the screen before the switch (data URL), shown behind the window. */
  backdrop?: string;
}

/** Resolves a file inside the installed @xterm/xterm package. */
function xtermAsset(relative: string): string {
  const pkgJson = require.resolve('@xterm/xterm/package.json');
  const file = join(dirname(pkgJson), relative);
  if (!existsSync(file)) {
    throw new Error(
      `@xterm/xterm is installed but ${relative} is missing (looked in ${file}). ` +
        `Run npm install in autorecorder/.`,
    );
  }
  return readFileSync(file, 'utf-8');
}

/**
 * Embeds JSON in a <script> without letting its contents close the tag.
 *
 * A cast is terminal output: it can contain literally anything, including the
 * characters `</script>`, and one such sequence would truncate the page.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

export function generateTerminalHtml(opts: TerminalRenderOptions): string {
  const { cast } = opts;
  const title = opts.title ?? cast.header.title ?? 'Windows PowerShell';
  const fontSize = opts.fontSize ?? 16;
  const startDelayMs = opts.startDelayMs ?? 900;
  const endHoldMs = opts.endHoldMs ?? 2500;
  const isBash = /MINGW|bash/i.test(title);
  const isPs = /PowerShell/i.test(title);
  const live = Boolean(opts.live);

  const xtermCss = xtermAsset('css/xterm.css');
  const xtermJs = xtermAsset('lib/xterm.js');

  // Only output events are replayed. The "i" events are the driver's own
  // keystrokes, kept in the cast as a transcript; replaying them too would
  // double every character the CLI already echoed.
  const outputEvents = cast.events.filter(([, code]) => code === 'o');

  // Profile icons, drawn here: a Git Bash-like diamond, or a prompt glyph.
  const psIcon =
    '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2.6 2.5h11.6c.6 0 .9.5.8 1L13.5 12.6c-.1.5-.6.9-1.1.9H.8c-.6 0-.9-.5-.8-1L1.5 3.4c.1-.5.6-.9 1.1-.9z" fill="#2b74d6"/><path d="m4.3 5.3 3.4 2.6-4.3 3" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.6 11.1h3.4" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const profileIcon = isPs ? psIcon : isBash
    ? '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2.3" y="2.3" width="11.4" height="11.4" rx="1.6" transform="rotate(45 8 8)" fill="#f05133"/><path d="M5.6 6.2 8 8.6l2.4-2.4M8 8.6v2.6" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="8" cy="11.4" r="1" fill="#fff"/><circle cx="5.5" cy="6" r="1" fill="#fff"/><circle cx="10.5" cy="6" r="1" fill="#fff"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" rx="2" fill="#2c2c2c" stroke="#5a5a5a"/><path d="m4 6 2.5 2L4 10" stroke="#e6e6e6" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M8 10.5h4" stroke="#bdbdbd" stroke-width="1.3" stroke-linecap="round"/></svg>';

  return `<!DOCTYPE html>
<html lang="en" style="background:#0b1a33">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${monoFontFace()}</style>
<style>${xtermCss}</style>
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: ${UI_STACK};
  }
  /* Windows 11-like dark "bloom": soft petals of blue light on deep navy, drawn
     with gradients only (no image). */
  #desktop {
    position: fixed;
    inset: ${opts.backdrop ? '0' : '0 0 48px 0'};
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse 34% 46% at 50% 62%, rgba(120, 190, 255, .55) 0%, rgba(60, 120, 230, .25) 38%, transparent 70%),
      radial-gradient(ellipse 22% 52% at 38% 58%, rgba(70, 140, 255, .45) 0%, transparent 70%),
      radial-gradient(ellipse 22% 52% at 62% 58%, rgba(70, 140, 255, .45) 0%, transparent 70%),
      radial-gradient(ellipse 40% 30% at 28% 74%, rgba(40, 90, 210, .45) 0%, transparent 72%),
      radial-gradient(ellipse 40% 30% at 72% 74%, rgba(40, 90, 210, .45) 0%, transparent 72%),
      radial-gradient(ellipse 70% 50% at 50% 100%, rgba(18, 48, 120, .9) 0%, transparent 75%),
      linear-gradient(180deg, #08142b 0%, #0b1d40 55%, #0d2350 100%);
  }
  ${opts.backdrop ? `#desktop { background: #1f1f1f url(${opts.backdrop}) 0 0 / 100% 100% no-repeat; display: block; }` : ''}
  ${live ? `#window { position: absolute !important; left: 135px; top: 126px; }` : ''}
  #window {
    ${live ? 'width: 1632px;' : 'min-width: 1100px;'}
    height: ${live ? '862px' : '620px'};
    border-radius: 8px;
    overflow: hidden;
    background: #0c0c0c;
    box-shadow: 0 18px 48px rgba(0, 0, 0, .45), 0 2px 8px rgba(0, 0, 0, .3), 0 0 0 1px rgba(255, 255, 255, .08);
    display: flex;
    flex-direction: column;
  }
  #titlebar {
    height: 40px;
    background: ${live ? '#2b2b2b' : '#202020'};
    display: flex;
    align-items: flex-end;
    flex: none;
    user-select: none;
  }
  #tab {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    min-width: 200px;
    max-width: 420px;
    margin-left: 8px;
    padding: 0 8px 0 12px;
    border-radius: 8px 8px 0 0;
    background: #0c0c0c;
    color: #ffffff;
    font-size: 12px;
    font-weight: ${isPs ? 600 : 400};
    box-sizing: border-box;
  }
  #tab .t { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #tab .x { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: #cfcfcf; }
  .tb-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: #cfcfcf; margin-bottom: 0; }
  #drag { flex: 1; height: 40px; }
  #controls { display: flex; align-self: flex-start; }
  #controls span { width: 46px; height: 40px; display: flex; align-items: center; justify-content: center; }
  .tb-sep { width: 1px; height: 18px; background: #4a4a4a; margin: 0 4px 7px 4px; align-self: flex-end; }
  #term-host { flex: 1; padding: 8px; background: #0c0c0c; overflow: hidden; }
  .xterm .xterm-viewport { overflow: hidden !important; background-color: #0c0c0c !important; }
  /* Overlay scrollbar: a thin thumb on the right, no track. */
  #sb { position: absolute; right: 2px; width: 6px; border-radius: 3px; background: rgba(255,255,255,.28); top: 48px; height: 120px; display: none; }
  #window { position: relative; }
</style>
<style>@keyframes __arWinIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}#window{animation:__arWinIn .15s ease-out both}</style>
</head>
<body>
  <div id="desktop">
    <div id="window">
      <div id="titlebar">
        <div id="tab">${profileIcon}<span class="t">${escapeHtml(title)}</span><span class="x"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#cfcfcf" stroke-width="1.1"/></svg></span></div>
        <span class="tb-btn"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="#cfcfcf" stroke-width="1.1"/></svg></span>
        <span class="tb-sep"></span>
        <span class="tb-btn" style="width:24px"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 3.5 5 7l3.5-3.5" stroke="#cfcfcf" stroke-width="1.1" fill="none"/></svg></span>
        <div id="drag"></div>
        <div id="controls">
          <span><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="#e8e8e8" stroke-width="1"/></svg></span>
          <span><svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.2" stroke="#e8e8e8" fill="none"/></svg></span>
          <span><svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="#e8e8e8" stroke-width="1"/></svg></span>
        </div>
      </div>
      <div id="term-host"></div>
      <div id="sb"></div>
    </div>
  </div>

<script>${xtermJs}</script>
<script>
(function () {
  var EVENTS = ${embedJson(outputEvents)};
  var COLS = ${cast.header.width};
  var ROWS = ${cast.header.height};
  var MONO = ${JSON.stringify(MONO_STACK)};

  var term = new window.Terminal({
    cols: COLS,
    rows: ROWS,
    fontSize: ${fontSize},
    fontFamily: MONO,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    convertEol: false,
    scrollback: ${opts.live ? 5000 : 0}, // live: a real terminal keeps its history (the error may be above the screen)
    theme: {
      background: '#0c0c0c',
      foreground: '#cccccc',
      cursor: '#ffffff',
      black: '#0c0c0c',
      red: '#c50f1f',
      green: '#13a10e',
      yellow: '#c19c00',
      blue: '#0037da',
      magenta: '#881798',
      cyan: '#3a96dd',
      white: '#cccccc',
      brightBlack: '#767676',
      brightRed: '#e74856',
      brightGreen: '#16c60c',
      brightYellow: '#f9f1a5',
      brightBlue: '#3b78ff',
      brightMagenta: '#b4009e',
      brightCyan: '#61d6d6',
      brightWhite: '#f2f2f2'
    }
  });
  window.__termReady = (document.fonts && document.fonts.load
    ? document.fonts.load('${fontSize}px ' + MONO.split(',')[0]).catch(function () {})
    : Promise.resolve()
  ).then(function () {
    term.open(document.getElementById('term-host'));
  });

  // Fits the terminal grid to the window: measures one cell of the real font
  // and resizes. Returns the size, so a live shell can be started at it.
  window.__termFit = function () {
    return window.__termReady.then(function () {
      var host = document.getElementById('term-host');
      var probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:${fontSize}px;font-family:' + MONO.replace(/"/g, "'") + ';';
      probe.textContent = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW';
      document.body.appendChild(probe);
      var cw = probe.getBoundingClientRect().width / 50;
      probe.remove();
      // Row height as xterm draws it (it rounds the line height up to whole px).
      var row = document.querySelector('.xterm-rows > div');
      var ch = row && row.getBoundingClientRect().height > 4 ? row.getBoundingClientRect().height : Math.ceil(${fontSize} * 1.2);
      var cols = Math.max(40, Math.floor((host.clientWidth - 16 - 4) / cw));
      var rows = Math.max(10, Math.floor((host.clientHeight - 16) / ch));
      term.resize(cols, rows);
      return { cols: cols, rows: rows };
    });
  };

  // Live mode: the caller writes a running PTY's output straight in, as it
  // arrives (the failure terminal). Resolves once xterm has drawn the chunk.
  // The thin scrollbar thumb appears once output has scrolled, like the real one.
  var written = 0;
  window.__termWrite = function (data) {
    return window.__termReady.then(function () {
      return new Promise(function (r) { term.write(data, r); });
    }).then(function () {
      written += (data.match(/\\n/g) || []).length;
      var sb = document.getElementById('sb');
      if (written > term.rows) {
        sb.style.display = 'block';
        var total = written + 1;
        var H = document.getElementById('term-host').clientHeight - 8;
        var h = Math.max(40, H * term.rows / total);
        sb.style.height = h + 'px';
        sb.style.top = (44 + H - h) + 'px';
      }
    });
  };

  // Live mode: where the last line matching \`pattern\` sits relative to the screen. linesUp > 0 when
  // it has scrolled above the visible rows (the caller wheel-scrolls up to it, as a person would).
  window.__termFindLast = function (pattern) {
    var re = new RegExp(pattern, 'i');
    var b = term.buffer.active;
    for (var i = b.length - 1; i >= 0; i--) {
      var line = b.getLine(i);
      if (line && re.test(line.translateToString(true))) {
        var row = document.querySelector('.xterm-rows > div');
        return { linesUp: Math.max(0, b.viewportY - i + 2), line: i, viewportY: b.viewportY, rowPx: row ? row.getBoundingClientRect().height : 18 };
      }
    }
    return null;
  };

  window.__termViewportY = function () { return term.buffer.active.viewportY; };

  window.__castReplayDone = false;
  window.__castEventCount = EVENTS.length;

  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  window.__startCastReplay = async function () {
    await window.__termReady;
    await sleep(${startDelayMs});

    var previous = 0;
    for (var i = 0; i < EVENTS.length; i++) {
      var event = EVENTS[i];
      var gap = event[0] - previous;
      previous = event[0];
      // Sub-frame gaps are not perceivable and cost a timer each; batching them
      // keeps a cast with thousands of tiny writes from stuttering.
      if (gap > 0.016) await sleep(gap * 1000);
      term.write(event[2]);
    }

    // Let xterm flush its last write before the hold starts, or the final line
    // can be missing from the very frames the hold exists to show.
    await new Promise(function (r) { term.write('', r); });
    await sleep(${endHoldMs});
    window.__castReplayDone = true;
  };
})();
</script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
