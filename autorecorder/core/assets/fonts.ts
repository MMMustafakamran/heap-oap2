/**
 * Cascadia Mono, embedded.
 *
 * The simulated VS Code and terminal windows name Cascadia/Consolas, which a
 * Windows desktop has and a Linux runner does not: there the code fell back to
 * DejaVu Sans Mono, which reads as "not Windows" at a glance. The font file
 * (Cascadia Mono Regular, SIL Open Font License 1.1, see CascadiaMono-OFL.txt;
 * from the microsoft/cascadia-code release) is inlined as a data URL, so the
 * windows render the same everywhere and need no network.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let cached: string | null = null;

/** Family name used in the @font-face rule below. */
export const MONO_FAMILY = 'AR Cascadia Mono';

/** CSS stack for code text: the embedded face first, then the usual Windows ones. */
export const MONO_STACK = `'${MONO_FAMILY}', 'Cascadia Mono', 'Cascadia Code', Consolas, 'Courier New', monospace`;

/** UI font stack: Segoe UI where it exists, close fallbacks elsewhere. */
export const UI_STACK = `'Segoe UI Variable Text', 'Segoe UI', 'Selawik', 'Noto Sans', 'Open Sans', system-ui, sans-serif`;

/** An @font-face rule with the font inlined. Empty string if the file is missing. */
export function monoFontFace(): string {
  if (cached !== null) return cached;
  try {
    const b64 = readFileSync(join(HERE, 'CascadiaMono-Regular.woff2')).toString('base64');
    cached = `@font-face{font-family:'${MONO_FAMILY}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:400;font-style:normal;font-display:block;}`;
  } catch {
    cached = '';
  }
  return cached;
}

/*
 * Selawik (Microsoft's open Segoe UI stand-in, SIL OFL 1.1, Selawik-OFL.txt;
 * from the microsoft/Selawik release) for VS Code's UI text, and the
 * Codicons font (@vscode/codicons: icons CC BY 4.0, code MIT, codicon-LICENSE.txt)
 * for its icons. Both inlined, like the code font.
 */
export const UI_FAMILY = 'AR Selawik';
export const ICON_FAMILY = 'AR Codicon';

const faceCache = new Map<string, string>();
function inlineFace(file: string, family: string, mime: string, format: string, weight = 400): string {
  const key = `${file}|${family}|${weight}`;
  const hit = faceCache.get(key);
  if (hit !== undefined) return hit;
  let css = '';
  try {
    const b64 = readFileSync(join(HERE, file)).toString('base64');
    css = `@font-face{font-family:'${family}';src:url(data:${mime};base64,${b64}) format('${format}');font-weight:${weight};font-style:normal;font-display:block;}`;
  } catch {}
  faceCache.set(key, css);
  return css;
}

/** @font-face rules for Selawik regular + semibold. */
export function uiFontFace(): string {
  return (
    inlineFace('Selawik-Regular.woff2', UI_FAMILY, 'font/woff2', 'woff2', 400) +
    inlineFace('Selawik-Semibold.woff2', UI_FAMILY, 'font/woff2', 'woff2', 600)
  );
}

/** @font-face rule for the Codicons icon font. */
export function codiconFace(): string {
  return inlineFace('codicon.ttf', ICON_FAMILY, 'font/ttf', 'truetype');
}

/** UI stack with the embedded Selawik first. */
export const VSCODE_UI_STACK = `'${UI_FAMILY}', ${UI_STACK}`;
