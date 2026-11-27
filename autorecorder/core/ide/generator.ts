import { existsSync, readFileSync } from 'node:fs';
import { codiconFace, ICON_FAMILY, monoFontFace, MONO_STACK, uiFontFace, VSCODE_UI_STACK as UI_STACK } from '../assets/fonts';
import { basename, join } from 'node:path';
import { createHighlighter, type Highlighter } from 'shiki';

export interface IdeTabConfig {
  filePath: string;
  startLine: number;
  endLine: number;
  tabLabel?: string;
  /** Error clips: exact text of a line the tester added because the doc page
   *  did not give it; drag-selected after the doc snippet, ~2 s hold (no new
   *  mark, stays inside `ide`); not found -> warn and skip. */
  addedText?: string | string[];
  /** Scrolled and rested on, never drag-selected (the auto VERSIONS.md tab). */
  scrollOnly?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Per-line syntax tokens from Shiki's real TextMate grammars.
 *
 * This replaced a hand-rolled regex highlighter. That version ran its keyword,
 * prop and number passes over markup it had already emitted, so a rule would
 * rewrite the `style` attribute of a span produced by an earlier rule --
 * `<span <span style="...">style</span>="color:...">` -- leaking raw CSS into
 * the rendered code pane on 642 lines across 16 of the 17 configured pages.
 *
 * Tokenizing first and escaping only token *content* makes that class of bug
 * structurally impossible: no pattern ever sees generated HTML.
 */
const SHIKI_THEME = 'dark-plus';

/** Grammars preloaded once; must cover every extension langFor() can return. */
const SHIKI_LANGS = ['tsx', 'typescript', 'javascript', 'json', 'python', 'markdown'] as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [SHIKI_THEME],
    langs: [...SHIKI_LANGS],
  });
  return highlighterPromise;
}

function langFor(ext: string): (typeof SHIKI_LANGS)[number] | null {
  if (ext === 'tsx' || ext === 'jsx') return 'tsx';
  if (ext === 'ts') return 'typescript';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'json') return 'json';
  if (ext === 'py') return 'python';
  if (ext === 'md') return 'markdown';
  return null;
}

/** Shiki's fontStyle is a bitmask: 1 italic, 2 bold, 4 underline. */
function fontStyleCss(fontStyle: number | undefined): string {
  if (!fontStyle) return '';
  let css = '';
  if (fontStyle & 1) css += 'font-style:italic;';
  if (fontStyle & 2) css += 'font-weight:bold;';
  if (fontStyle & 4) css += 'text-decoration:underline;';
  return css;
}

/**
 * @returns One HTML string per source line, already escaped and safe to embed.
 *   Falls back to plain escaped text when the language has no grammar, so an
 *   unknown extension renders readable code rather than nothing.
 */
async function highlightLines(code: string, ext: string): Promise<string[]> {
  const rawLines = code.split('\n');
  const plain = (): string[] =>
    rawLines.map((l) => (l.trim() ? escapeHtml(l) : '&nbsp;'));

  const lang = langFor(ext);
  if (!lang) return plain();

  try {
    const highlighter = await getHighlighter();
    const { tokens } = highlighter.codeToTokens(code, {
      lang,
      theme: SHIKI_THEME,
    });

    return rawLines.map((raw, idx) => {
      if (!raw.trim()) return '&nbsp;';
      const lineTokens = tokens[idx];
      if (!lineTokens) return escapeHtml(raw);

      return lineTokens
        .map(
          (t) =>
            `<span style="color:${t.color ?? '#d4d4d4'};${fontStyleCss(
              t.fontStyle,
            )}">${escapeHtml(t.content)}</span>`,
        )
        .join('');
    });
  } catch {
    // Never let a highlighting failure blank out the IDE pane.
    return plain();
  }
}

/** One Codicons glyph (see assets/fonts.ts). */
function ci(code: string, size = 16, extra = ''): string {
  return `<i class="ci" style="font-size:${size}px;${extra}">&#x${code};</i>`;
}
const CI = {
  files: 'eaf0', search: 'ea6d', scm: 'ea68', debug: 'eb91', extensions: 'eae6', beaker: 'ea79',
  account: 'eb99', gear: 'eb51', chevronRight: 'eab6', chevronDown: 'eab4', close: 'ea76', ellipsis: 'ea7c',
  arrowLeft: 'ea9b', arrowRight: 'ea9c', layoutLeft: 'ebf3', layoutPanel: 'ec01', layoutRight: 'ec00',
  layout: 'ebeb', split: 'eb56', branch: 'ea68', sync: 'ea77', error: 'ea87', warning: 'ea6c', bell: 'eaa2',
  method: 'ea8c', klass: 'eb5b', remote: 'eb3a', check: 'eab2', copilot: 'ec1e',
} as const;

function getFileIcon(ext: string): string {
  const isTsx = ext === 'tsx' || ext === 'ts' || ext === 'js' || ext === 'jsx';
  const isPython = ext === 'py';
  const isJson = ext === 'json';
  const isMd = ext === 'md';

  if (isPython) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11.9 2c-4.4 0-4.1 1.9-4.1 1.9l.01 2h4.2v.6H5.8S2 6.1 2 10.6s3.3 4.3 3.3 4.3h2v-2.8s-.1-3.3 3.3-3.3h5.7s3.2.1 3.2-3.1-3.2-3.7-7.6-3.7z" fill="#3776ab"/><path d="M12.1 22c4.4 0 4.1-1.9 4.1-1.9l-.01-2h-4.2v-.6h6.2s3.8.4 3.8-4.1-3.3-4.3-3.3-4.3h-2v2.8s.1 3.3-3.3 3.3H7.7s-3.2-.1-3.2 3.1 3.2 3.7 7.6 3.7z" fill="#ffd43b"/><circle cx="9.5" cy="4.5" r=".7" fill="#fff"/><circle cx="14.5" cy="19.5" r=".7" fill="#fff"/></svg>`;
  }
  if (ext === 'tsx' || ext === 'jsx') {
    // Seti's React atom, the icon VS Code shows for .tsx.
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#519aba" stroke-width="1.4"><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.6" fill="#519aba" stroke="none"/></svg>`;
  }
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    return `<svg width="15" height="15" viewBox="0 0 24 24"><text x="2" y="18" fill="#cbcb41" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold">JS</text></svg>`;
  }
  if (isTsx) {
    return `<svg width="15" height="15" viewBox="0 0 24 24"><text x="2" y="18" fill="#519aba" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold">TS</text></svg>`;
  }
  if (isJson) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="#cbcb41"><text x="3" y="17" fill="#cbcb41" font-family="Consolas, monospace" font-size="14" font-weight="bold">{ }</text></svg>`;
  }
  if (isMd) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="#42a5f5"><rect width="24" height="24" rx="2" fill="none" stroke="#42a5f5" stroke-width="2"/><path d="M4 16V8l4 4 4-4v8M17 8v8m-3-3l3 3 3-3" fill="none" stroke="#42a5f5" stroke-width="2"/></svg>`;
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="#858585"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#90a4ae"/></svg>`;
}

function getLangLabel(ext: string): string {
  if (ext === 'py') return 'Python 3.12';
  if (ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'js')
    return 'TypeScript JSX';
  if (ext === 'json') return 'JSON';
  if (ext === 'md') return 'Markdown';
  return 'Plain Text';
}

export async function generateIdeHtml(
  rootDir: string,
  primaryFilePath: string,
  startLine = 1,
  endLine = 30,
  extraTabs: IdeTabConfig[] = [],
  activeTabIdx = 0,
): Promise<string> {
  const tabsList: IdeTabConfig[] = [
    { filePath: primaryFilePath, startLine, endLine },
    ...extraTabs,
  ];

  // Read and tokenize every tab up front; the render below stays synchronous.
  const tabSources = await Promise.all(
    tabsList.map(async (tab) => {
      const fullPath = join(rootDir, tab.filePath);
      const missing = !existsSync(fullPath);
      // Said out loud. A missing ideFile used to render one grey comment line
      // and nothing else, which films as an empty editor -- indistinguishable
      // from a short file. That is how every generated VERSIONS.md reached the
      // demos blank: gitignored, not written on the --skip-install path, and
      // no complaint from anywhere in the pipeline.
      if (missing) {
        console.warn(`   ⚠️  IDE file missing: ${tab.filePath} -- the clip will show an empty editor.`);
      }
      const raw = missing ? '// File not found' : readFileSync(fullPath, 'utf-8');
      // Normalize CRLF so a stray \r never lands inside a rendered code line.
      const code = raw.replace(/\r\n/g, '\n');
      const ext = basename(tab.filePath).split('.').pop() ?? '';
      return { code, ext, lines: await highlightLines(code, ext) };
    }),
  );

  // Render tab headers
  const tabHeadersHtml = tabsList
    .map((tab, idx) => {
      const fileName = basename(tab.filePath);
      const ext = fileName.split('.').pop() ?? '';
      const icon = getFileIcon(ext);
      const isActive = idx === activeTabIdx;

      return `
        <div
          id="ide-tab-${idx}"
          class="tab ${isActive ? 'active' : ''}"
          onclick="window.switchIdeTab(${idx})"
          style="${
            isActive
              ? 'background:#1f1f1f;box-shadow:inset 0 1px 0 #0078d4;border-top:1px solid #0078d4;color:#ffffff;'
              : 'background:#181818;border-top:1px solid transparent;color:#9d9d9d;'
          }"
        >
          <span class="file-icon">${icon}</span>
          <span style="${tab.scrollOnly ? 'font-style:italic;' : ''}">${escapeHtml(fileName)}</span>
          <span class="close-btn" style="visibility:${isActive ? 'visible' : 'hidden'}">${ci(CI.close, 16)}</span>
        </div>
      `;
    })
    .join('');

  // Render file viewports for all tabs
  const tabBodiesHtml = tabsList
    .map((tab, idx) => {
      const { code, ext, lines: highlightedLines } = tabSources[idx];

      const fileName = basename(tab.filePath);
      const normalizedPath = tab.filePath.replace(/\\/g, '/');
      const pathParts = normalizedPath.split('/');
      const codeLines = code.split('\n');
      // Indent guides: one level per indent unit of leading whitespace; blank
      // lines take the smaller level of their neighbours, as the editor does.
      const unit = ext === 'py' ? 4 : 2;
      const lead = codeLines.map((l) => (l.trim() ? Math.floor((l.match(/^[ \t]*/)?.[0].replace(/\t/g, '    ').length ?? 0) / unit) : -1));
      const levels = lead.map((lv, i) => {
        if (lv >= 0) return lv;
        let a = 0;
        for (let k = i - 1; k >= 0; k--) if (lead[k] >= 0) { a = lead[k]; break; }
        let b = 0;
        for (let k = i + 1; k < lead.length; k++) if (lead[k] >= 0) { b = lead[k]; break; }
        return Math.min(a, b);
      });

      const linesHtml = codeLines
        .map((line, lIdx) => {
          const lineNum = lIdx + 1;
          const isHighlighted =
            lineNum >= tab.startLine && lineNum <= tab.endLine;
          const isCaretLine = lineNum === tab.startLine;
          const highlightedContent = highlightedLines[lIdx] ?? '&nbsp;';

          // The snippet is marked, not yet highlighted: the recorder selects
          // it on camera by dragging the cursor down the lines, adding the
          // `highlighted` classes as it goes (window.selectIdeLines). A range
          // already painted when the window fades in read as a slide, not as
          // a person finding the code.
          const snippetAttr = isHighlighted ? ' data-snippet="1"' : '';
          const caretHtml = isCaretLine ? '<span class="vs-caret"></span>' : '';

          const lv = levels[lIdx] ?? 0;
          const guides = lv > 0 ? `<i class="ig" style="width:${lv * unit}ch;background-size:${unit}ch 100%"></i>` : '';
          return `
            <div class="code-line${isCaretLine ? ' current-line' : ''}" data-line="${lineNum}"${snippetAttr}>
              <div class="line-num${isCaretLine ? ' current' : ''}">${lineNum}</div>
              <div class="line-content">${guides}<span>${highlightedContent}${caretHtml}</span></div>
            </div>
          `;

        })
        .join('');

      const minimapHtml = codeLines
        .slice(0, 100)
        .map((line, lIdx) => {
          const lineNum = lIdx + 1;
          const isHighlighted =
            lineNum >= tab.startLine && lineNum <= tab.endLine;
          const width = Math.min(
            Math.max((line.trim().length / 60) * 100, 10),
            90,
          );
          return `<div class="minimap-line ${
            isHighlighted ? 'active' : ''
          }" style="width:${width}%;"></div>`;
        })
        .join('');

      const breadcrumbsHtml = pathParts
        .map((part, pIdx) => {
          const isLast = pIdx === pathParts.length - 1;
          return `
            <span class="breadcrumb-item ${isLast ? 'active' : ''}">
              ${
                isLast
                  ? getFileIcon(ext)
                  : ''
              }
              <span>${escapeHtml(part)}</span>
            </span>
            ${!isLast ? `<span class="breadcrumb-sep">${ci(CI.chevronRight, 16)}</span>` : ''}
          `;
        })
        .join('');
      // The symbol the caret sits in, as the breadcrumb bar shows it.
      const symMatch =
        /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|const|type)\s+(\w+)/m.exec(code) ??
        /^\s*(def|class)\s+(\w+)/m.exec(code);
      const symbolHtml = symMatch
        ? `<span class="breadcrumb-sep">${ci(CI.chevronRight, 16)}</span><span class="breadcrumb-item">${ci(/class|interface|type/.test(symMatch[1]) ? CI.klass : CI.method, 16, 'color:' + (/class|interface|type/.test(symMatch[1]) ? '#ee9d28' : '#b180d7'))}<span>${escapeHtml(symMatch[2])}</span></span>`
        : '';

      const isDisplayed = idx === activeTabIdx;

      return `
        <div id="ide-view-${idx}" class="editor-body-view" style="display:${
        isDisplayed ? 'flex' : 'none'
      };flex-direction:column;flex:1;overflow:hidden;">
          <div class="breadcrumbs-bar">
            ${breadcrumbsHtml}${symbolHtml}
          </div>
          <div class="editor-body">
            <div class="code-viewport">
              ${linesHtml}
            </div>
            <div class="minimap">
              ${minimapHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // Explorer: one tree built from every open file's path, folders first, so
  // backend files sit under backend/ and nothing is listed under the wrong folder.
  interface TreeDir { dirs: Map<string, TreeDir>; files: Map<string, number> }
  const rootTree: TreeDir = { dirs: new Map(), files: new Map() };
  tabsList.forEach((tab, tIdx) => {
    const parts = tab.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let node = rootTree;
    for (const dir of parts.slice(0, -1)) {
      if (!node.dirs.has(dir)) node.dirs.set(dir, { dirs: new Map(), files: new Map() });
      node = node.dirs.get(dir)!;
    }
    const file = parts[parts.length - 1];
    if (!node.files.has(file)) node.files.set(file, tIdx);
  });
  const treeNodes: string[] = [];
  const chevron = ci(CI.chevronDown, 16, 'color:#c5c5c5');
  const chevronClosed = ci(CI.chevronRight, 16, 'color:#c5c5c5');
  // Tree indent guides: one thin line per ancestor level, as the explorer draws them.
  const guides = (depth: number): string =>
    Array.from({ length: Math.max(0, depth - 1) }, (_, k) => `<i class="tg" style="left:${16 + k * 8}px"></i>`).join('');
  // A few folders every project has, collapsed and greyed (git-ignored), so the tree is not just the open files.
  if (rootTree.dirs.has('frontend')) {
    const fe = rootTree.dirs.get('frontend')!;
    for (const ign of ['.next', 'node_modules']) if (!fe.dirs.has(ign)) fe.dirs.set(ign, { dirs: new Map(), files: new Map() });
  }
  const IGNORED = new Set(['.next', 'node_modules', '__pycache__', '.venv']);
  const walk = (node: TreeDir, depth: number): void => {
    const byName = (a: [string, unknown], b: [string, unknown]) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' });
    for (const [name, child] of [...node.dirs.entries()].sort(byName)) {
      const ignored = IGNORED.has(name);
      const empty = child.dirs.size === 0 && child.files.size === 0;
      // Git decorations: folders holding changed files in the modified colour with a dot.
      const deco = ignored ? 'color:#8c8c8c' : depth === 1 ? 'color:#e2c08d' : 'color:#73c991';
      const dot = ignored ? '' : `<span class="gdot" style="background:${depth === 1 ? '#e2c08d' : '#73c991'}"></span>`;
      treeNodes.push(`
        <div class="tree-node folder-node" style="padding-left:${8 + depth * 8}px">
          ${guides(depth)}${empty ? chevronClosed : chevron}
          <span class="folder-name" style="${deco}">${escapeHtml(name)}</span>${dot}
        </div>`);
      walk(child, depth + 1);
    }
    for (const [name, tIdx] of [...node.files.entries()].sort(byName)) {
      const ext = name.split('.').pop() ?? '';
      treeNodes.push(`
        <div class="tree-node file-node${tIdx === activeTabIdx ? ' active-file' : ''}" data-tab-idx="${tIdx}" style="padding-left:${8 + depth * 8 + 16}px" onclick="window.switchIdeTab(${tIdx})">
          ${guides(depth)}<span class="file-icon">${getFileIcon(ext)}</span>
          <span class="file-label" style="color:#e2c08d">${escapeHtml(name)}</span><span class="gtag">M</span>
        </div>`);
    }
  };
  walk(rootTree, 1);

  const primaryExt = basename(primaryFilePath).split('.').pop() ?? '';
  const primaryLang = getLangLabel(primaryExt);
  const projectName = basename(rootDir) || 'workspace';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(projectName)} - Visual Studio Code</title>
  <style>${monoFontFace()}${uiFontFace()}${codiconFace()}</style>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body, html {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #181818;
      color: #cccccc;
      font-family: ${UI_STACK};
      user-select: none;
      -webkit-user-select: none;
    }
    .vscode-container {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: calc(100vh - 48px);
      overflow: hidden;
      animation: win11Open 0.22s cubic-bezier(0.1, 0.9, 0.2, 1);
    }
    @keyframes win11Open {
      0% {
        opacity: 0.85;
        transform: scale(0.99) translateY(8px);
      }
      100% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    /* Titlebar */
    .titlebar {
      height: 35px;
      background: #181818;
      border-bottom: 1px solid #2b2b2b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-size: 12px;
      color: #9d9d9d;
    }
    .titlebar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .menubar {
      display: flex;
      gap: 10px;
      font-size: 12px;
      color: #cccccc;
    }
    .menubar span {
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .menubar span:hover {
      background: #2a2d2e;
    }
    /* Command Palette Search Box */
    .titlebar-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 440px;
      height: 24px;
      background: #2a2a2a;
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-size: 11px;
      color: #cccccc;
      cursor: pointer;
    }
    .titlebar-center .search-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .titlebar-center .keybadge {
      background: #383838;
      border: 1px solid #4a4a4a;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10px;
      color: #858585;
    }
    .titlebar-controls {
      display: flex;
      align-items: center;
      gap: 16px;
      color: #858585;
      font-size: 13px;
    }
    /* Main Layout */
    .main-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    /* Activity Bar */
    .activity-bar {
      width: 48px;
      background: #181818;
      border-right: 1px solid #2b2b2b;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      color: #858585;
    }
    .activity-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
    }
    .activity-icon {
      width: 42px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      cursor: pointer;
    }
    .activity-icon.active {
      color: #ffffff;
    }
    .activity-icon.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 2px;
      background: #007acc;
    }
    .badge {
      position: absolute;
      bottom: 6px;
      right: 6px;
      background: #007acc;
      color: #ffffff;
      font-size: 9px;
      font-weight: bold;
      border-radius: 8px;
      padding: 1px 4px;
    }
    /* Sidebar */
    .sidebar {
      width: 250px;
      background: #181818;
      border-right: 1px solid #2b2b2b;
      display: flex;
      flex-direction: column;
      font-size: 12px;
    }
    .sidebar-header {
      padding: 10px 16px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #bbbbbb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sidebar-project {
      padding: 6px 12px;
      font-weight: bold;
      font-size: 11px;
      color: #e1e1e1;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .file-tree {
      flex: 1;
      overflow-y: auto;
      padding: 2px 4px;
      font-family: ${UI_STACK};
      font-size: 12px;
      line-height: 22px;
    }
    .tree-node {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 0 6px;
      color: #cccccc;
      border-radius: 0;
      cursor: pointer;
      position: relative;
    }
    .tree-node.pl-1 { padding-left: 14px; }
    .tree-node.pl-2 { padding-left: 22px; }
    .tree-node.pl-3 { padding-left: 30px; }
    .tree-node.pl-4 { padding-left: 38px; }
    /* Files sit under the chevron column, the way the real tree indents them. */
    .tree-node.file-node { padding-left: 22px; }
    .tree-node.file-node.pl-1 { padding-left: 30px; }
    .tree-node.file-node.pl-2 { padding-left: 38px; }
    .tree-node.file-node.pl-3 { padding-left: 46px; }
    .tree-node.file-node.pl-4 { padding-left: 54px; }
    .tree-node.active-file {
      background: #04395e;
      outline: 1px solid #0078d4;
      outline-offset: -1px;
      color: #ffffff;
    }
    .folder-name { color: #cccccc; }
    .pane-collapsed {
      height: 22px;
      border-top: 1px solid #2b2b2b;
      display: flex;
      align-items: center;
      gap: 2px;
      padding-left: 2px;
      font-size: 11px;
      font-weight: 700;
      color: #cccccc;
      flex: none;
    }
    .file-icon { display: flex; align-items: center; }
    /* Editor Area */
    .editor-pane {
      display: flex;
      flex-direction: column;
      flex: 1;
      background: #1f1f1f;
      overflow: hidden;
      position: relative;
    }
    .tabs-bar {
      height: 35px;
      background: #181818;
      border-bottom: 1px solid #2b2b2b;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tabs-left {
      display: flex;
      height: 100%;
    }
    .tab {
      height: 100%;
      border-right: 1px solid #2b2b2b;
      padding: 0 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .tab .close-btn {
      color: #858585;
      font-size: 12px;
      margin-left: 6px;
      border-radius: 3px;
      padding: 1px 3px;
    }
    .tab .close-btn:hover {
      background: #333;
      color: #fff;
    }
    .tabs-right-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-right: 12px;
      color: #858585;
    }
    .breadcrumbs-bar {
      height: 22px;
      background: #1f1f1f;
      border-bottom: 1px solid #2b2b2b;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: ${UI_STACK};
      font-size: 11px;
      color: #858585;
    }
    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .breadcrumb-item.active {
      color: #cccccc;
    }
    .breadcrumb-sep {
      color: #6f6f6f;
      font-size: 14px;
      line-height: 1;
    }
    /* Code Viewer */
    .editor-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .code-viewport {
      flex: 1;
      overflow-y: auto;
      padding: 10px 0 60px 0;
      font-family: ${MONO_STACK};
      font-size: 14px;
      line-height: 22px;
      -webkit-font-smoothing: antialiased;
    }
    .code-viewport::-webkit-scrollbar { width: 14px; height: 14px; background: transparent; }
    .code-viewport::-webkit-scrollbar-track { background: transparent; }
    .code-viewport::-webkit-scrollbar-thumb { background: rgba(121, 121, 121, 0.4); border-radius: 0; }
    .code-viewport::-webkit-scrollbar-corner { background: transparent; }
    .code-line.current-line .line-content { box-shadow: inset 0 0 0 2px #282828; }
    .line-num.current { color: #cccccc; }
    .line-content { position: relative; }
    .ig {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      pointer-events: none;
      background-image: linear-gradient(to right, #404040 0, #404040 1px, transparent 1px);
      background-repeat: repeat-x;
    }
    .code-line {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 22px;
    }
    /*
     * The range marker only. The fill itself belongs to the text, not the row
     * -- see .line-content.highlighted > span below.
     *
     * box-shadow rather than border-left: a border is part of the box, so it
     * pushed every highlighted line 3px right of the unhighlighted lines around
     * it, and the code visibly stepped in and out at the range edges.
     */
    .code-line.highlighted {
      /* A real selection has no gutter marker; the fill on the text is it. */
    }
    .line-num {
      width: 58px;
      text-align: right;
      padding-right: 26px;
      color: #6e7681;
      flex-shrink: 0;
      user-select: none;
      font-size: 12px;
    }
    .line-num.highlighted {
      color: #cccccc;
    }
    .line-content {
      flex: 1;
      white-space: pre;
      color: #d4d4d4;
      padding-right: 24px;
    }
    .line-content.highlighted {
      color: #d4d4d4;
    }
    /*
     * Hug the glyphs, the way an editor selection does, instead of flooding the
     * row to the right-hand edge of the pane. The span is inline, so its
     * background ends where the line's text ends -- including the leading
     * indentation, which is part of the token stream.
     */
    .line-content.highlighted > span {
      background: #264f78;
      border-radius: 0;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    /* Blinking VS Code Caret */
    .vs-caret {
      display: inline-block;
      width: 2px;
      height: 15px;
      background: #528bff;
      margin-left: 2px;
      vertical-align: middle;
      animation: vsBlink 1s step-start infinite;
    }
    @keyframes vsBlink {
      50% { opacity: 0; }
    }
    /* Minimap */
    .minimap {
      width: 68px;
      background: #181818;
      border-left: 1px solid #252526;
      display: flex;
      flex-direction: column;
      padding: 10px 6px;
      gap: 3px;
      opacity: 0.65;
      overflow: hidden;
    }
    .minimap-line {
      height: 2px;
      background: #4a4a4a;
      border-radius: 1px;
    }
    .minimap-line.active {
      background: #007acc;
      box-shadow: 0 0 4px #007acc;
    }
    /* Status Bar */
    .statusbar {
      height: 22px;
      background: #181818;
      border-top: 1px solid #2b2b2b;
      color: #cccccc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-size: 11px;
      z-index: 10;
    }
    .statusbar-left, .statusbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .statusbar-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    /* Look pass (2026-11-27): Selawik 13px UI, Codicons, Dark Modern chrome. */
    .ci { font-family: '${ICON_FAMILY}'; font-style: normal; line-height: 1; display: inline-flex; align-items: center; justify-content: center; -webkit-font-smoothing: antialiased; }
    body, html { font-size: 13px; }
    .titlebar { height: 35px; background: #181818; font-size: 13px; position: relative; padding: 0 0 0 10px; }
    .titlebar-left { gap: 8px; }
    .menubar { gap: 0; font-size: 13px; color: #cccccc; }
    .menubar span { padding: 3px 7px; }
    .titlebar-center { width: auto; height: 26px; background: transparent; border: 0; padding: 0; gap: 10px; font-size: 13px; }
    .nav-arrows { display: inline-flex; gap: 10px; color: #cccccc; }
    .cc-box { width: 520px; height: 24px; background: #222222; border: 1px solid #3c3c3c; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #9d9d9d; font-size: 12.5px; }
    .titlebar-controls { gap: 0; color: #cccccc; height: 35px; }
    .titlebar-controls .lay { display: inline-flex; gap: 12px; margin-right: 14px; }
    .titlebar-controls .cap { width: 46px; height: 35px; display: inline-flex; align-items: center; justify-content: center; }
    .activity-bar { padding: 4px 0; color: #868686; }
    .activity-group { gap: 2px; }
    .activity-icon { width: 48px; height: 48px; }
    .activity-icon.active { color: #d7d7d7; }
    .activity-icon.active::before { top: 0; bottom: 0; background: #0078d4; }
    .badge { bottom: 8px; right: 6px; background: #0078d4; font-size: 9px; font-weight: 600; border-radius: 9px; padding: 1px 4px; min-width: 16px; text-align: center; }
    .sidebar-header { font-size: 13px; text-transform: none; letter-spacing: 0; font-weight: 400; color: #cccccc; padding: 8px 12px 8px 20px; }
    .sidebar-project { font-size: 13px; font-weight: 700; color: #cccccc; padding: 2px 4px; gap: 2px; }
    .file-tree { font-size: 13px; line-height: 22px; padding: 0; }
    .tree-node { gap: 4px; padding-right: 8px; }
    .tree-node .tg { position: absolute; top: 0; bottom: 0; width: 1px; background: #585858; opacity: .45; }
    .tree-node .gdot { width: 7px; height: 7px; border-radius: 50%; margin-left: auto; opacity: .9; }
    .tree-node .gtag { margin-left: auto; color: #e2c08d; font-size: 12px; }
    .tree-node.active-file { background: #37373d; outline: 1px solid #0078d4; }
    .pane-collapsed { font-size: 11px; text-transform: uppercase; }
    .tab { font-size: 13px; padding: 0 6px 0 10px; gap: 6px; }
    .tab .close-btn { margin-left: 4px; padding: 2px; display: inline-flex; }
    .tabs-right-actions { gap: 14px; color: #cccccc; }
    .breadcrumbs-bar { font-size: 13px; height: 22px; gap: 2px; color: #a9a9a9; }
    .breadcrumb-sep { color: #a9a9a9; display: inline-flex; }
    .breadcrumb-item { gap: 4px; }
    .statusbar { font-size: 12px; background: #181818; color: #cccccc; }
    .statusbar-item .ci { margin-right: 3px; }
    .statusbar-left, .statusbar-right { gap: 14px; }
    .line-num { color: #6e7681; font-size: 14px; }
    .line-num.current, .line-num.highlighted { color: #cccccc; }
  </style>
</head>
<body>
  <div class="vscode-container">
    <!-- Title Bar -->
    <header class="titlebar">
      <div class="titlebar-left">
        <svg class="vs-logo" width="16" height="16" viewBox="0 0 24 24"><path fill="#0065a9" d="M17.6 1.8 8.2 10.4 4.3 7.4 2.2 8.4v7.2l2.1 1 3.9-3 9.4 8.6 4.2-2V3.8l-4.2-2z"/><path fill="#007acc" d="M17.6 1.8 8.2 10.4l3.1 2.9 6.3-4.8v-6.7z"/><path fill="#1f9cf0" d="M17.6 22.2 8.2 13.6l3.1-2.9 6.3 4.8v6.7z"/></svg>
        <div class="menubar">
          <span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span>Run</span><span>Terminal</span><span>Help</span>
        </div>
      </div>
      <div class="titlebar-center">
        <span class="nav-arrows">${ci(CI.arrowLeft, 16)}${ci(CI.arrowRight, 16, 'color:#6b6b6b')}</span>
        <div class="cc-box">${ci(CI.search, 14)}<span>${escapeHtml(projectName)}</span></div>
      </div>
      <div class="titlebar-controls">
        <span class="lay">${ci(CI.layoutLeft, 16)}${ci(CI.layoutPanel, 16)}${ci(CI.layoutRight, 16)}${ci(CI.layout, 16)}</span>
        <span class="cap"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="#ccc"/></svg></span>
        <span class="cap"><svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" stroke="#ccc" fill="none"/></svg></span>
        <span class="cap"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="#ccc"/></svg></span>
      </div>
    </header>

    <!-- Main Workspace -->
    <div class="main-body">
      <!-- Activity Bar -->
      <aside class="activity-bar">
        <div class="activity-group">
          <div class="activity-icon active">${ci(CI.files, 24)}</div>
          <div class="activity-icon">${ci(CI.search, 24)}</div>
          <div class="activity-icon">${ci(CI.scm, 24)}<span class="badge">12</span></div>
          <div class="activity-icon">${ci(CI.debug, 24)}</div>
          <div class="activity-icon">${ci(CI.extensions, 24)}<span class="badge">1</span></div>
          <div class="activity-icon">${ci(CI.beaker, 24)}</div>
        </div>
        <div class="activity-group">
          <div class="activity-icon">${ci(CI.account, 24)}</div>
          <div class="activity-icon">${ci(CI.gear, 24)}</div>
        </div>
      </aside>

      <!-- Sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          <span>Explorer</span>
          <span style="color:#cccccc;">${ci(CI.ellipsis, 16)}</span>
        </div>
        <div class="sidebar-project">
          ${ci(CI.chevronDown, 16)}
          <span>${escapeHtml(projectName)}</span>
        </div>
        <div class="file-tree">
          ${treeNodes.join('')}
        </div>
        <div class="pane-collapsed">${ci(CI.chevronRight, 16)}<span>Outline</span></div>
        <div class="pane-collapsed">${ci(CI.chevronRight, 16)}<span>Timeline</span></div>
      </div>

      <!-- Editor Pane -->
      <main class="editor-pane">
        <div class="tabs-bar">
          <div class="tabs-left">
            ${tabHeadersHtml}
          </div>
          <div class="tabs-right-actions">${ci(CI.split, 16)}${ci(CI.ellipsis, 16)}</div>
        </div>

        ${tabBodiesHtml}
      </main>
    </div>

    <!-- Status Bar -->
    <footer class="statusbar">
      <div class="statusbar-left">
        <span class="statusbar-item" style="background:#0078d4;color:#fff;padding:0 9px;margin-left:-10px;height:100%;">${ci(CI.remote, 16)}</span>
        <span class="statusbar-item">${ci(CI.branch, 16)} main*</span>
        <span class="statusbar-item">${ci(CI.sync, 16)}</span>
        <span class="statusbar-item">${ci(CI.error, 16)} 0 ${ci(CI.warning, 16)} 0</span>
      </div>
      <div class="statusbar-right">
        <span class="statusbar-item">Ln ${startLine}, Col 1</span>
        <span class="statusbar-item">Spaces: ${primaryExt === 'py' ? 4 : 2}</span>
        <span class="statusbar-item">UTF-8</span>
        <span class="statusbar-item">LF</span>
        <span class="statusbar-item">{ } ${primaryLang}</span>
        <span class="statusbar-item">${ci(CI.check, 16)} Prettier</span>
        <span class="statusbar-item">${ci(CI.bell, 16)}</span>
      </div>
    </footer>
  </div>

  <script>
    // Paints the selection over lines from..to of view idx, the way a drag
    // would: called once per line as the cursor passes it.
    window.selectIdeLines = function(idx, from, to) {
      var view = document.getElementById('ide-view-' + idx);
      if (!view) return;
      var rows = view.querySelectorAll('.code-line[data-line]');
      var cur = view.querySelectorAll('.current-line');
      for (var c = 0; c < cur.length; c++) cur[c].classList.remove('current-line');
      for (var i = 0; i < rows.length; i++) {
        var n = Number(rows[i].getAttribute('data-line'));
        var on = n >= from && n <= to;
        rows[i].classList.toggle('highlighted', on);
        var num = rows[i].querySelector('.line-num');
        var txt = rows[i].querySelector('.line-content');
        if (num) num.classList.toggle('highlighted', on);
        if (txt) txt.classList.toggle('highlighted', on);
      }
    };
    window.switchIdeTab = function(idx) {

      var tabs = document.querySelectorAll('.tab');
      var views = document.querySelectorAll('.editor-body-view');
      for (var i = 0; i < tabs.length; i++) {
        if (i === idx) {
          tabs[i].classList.add('active');
          tabs[i].style.background = '#1f1f1f';
          tabs[i].style.borderTop = '1px solid #0078d4';
          tabs[i].style.boxShadow = 'inset 0 1px 0 #0078d4';
          tabs[i].style.color = '#ffffff';
          var cb = tabs[i].querySelector('.close-btn'); if (cb) cb.style.visibility = 'visible';
        } else {
          tabs[i].classList.remove('active');
          tabs[i].style.background = '#181818';
          tabs[i].style.borderTop = '1px solid transparent';
          tabs[i].style.boxShadow = 'none';
          tabs[i].style.color = '#9d9d9d';
          var cbi = tabs[i].querySelector('.close-btn'); if (cbi) cbi.style.visibility = 'hidden';
        }
        if (views[i]) views[i].style.display = i === idx ? 'flex' : 'none';
      }
      var fileNodes = document.querySelectorAll('.tree-node.file-node');
      for (var j = 0; j < fileNodes.length; j++) {
        if (fileNodes[j].getAttribute('data-tab-idx') === String(idx)) {
          fileNodes[j].classList.add('active-file');
        } else {
          fileNodes[j].classList.remove('active-file');
        }
      }
    };
  </script>
</body>
</html>`;
}



