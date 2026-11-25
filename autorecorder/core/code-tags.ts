/**
 * Harness code tags (owner, 2026-11-25):
 *
 *   ADDED:    code the doc never gives, needed to run the page at all. Drag-selected in the IDE
 *             segment, one `added` mark per block, and the narration says it wasn't on the page.
 *   CHANGED:  wiring (agent ids, ports, URLs, config). Never selected, never voiced: the comment is
 *             read while the code scrolls by.
 *   HARNESS   legacy tag: today's behaviour (only `addedText` selects anything).
 *
 * Comment forms: `// ADDED:`, `# ADDED:`, `/* ADDED:`, `{/* ADDED:`, `<!-- ADDED:` (and ` * ADDED:`
 * inside a block comment). Same forms for CHANGED:.
 */

/** A line carrying the ADDED tag in one of the accepted comment forms. */
export const ADDED_TAG = /(?:\/\/|#|\/\*|<!--)\s*ADDED:|^\s*\*\s*ADDED:/;
/** A line carrying the CHANGED tag (wiring: never selected). */
export const CHANGED_TAG = /(?:\/\/|#|\/\*|<!--)\s*CHANGED:|^\s*\*\s*CHANGED:/;
/** The line is only a comment (the tag labels the code below it). */
const COMMENT_ONLY = /^\s*(?:\/\/|#|\/\*|\{\/\*|<!--|\*)/;
/** A comment-only tag line covers at most this many following lines (up to the first blank line). */
const MAX_FOLLOW = 6;

export interface AddedBlock {
  /** 1-based, inclusive. */
  from: number;
  to: number;
  /** First line's text, trimmed (the `added` mark's detail). */
  text: string;
}

/**
 * The ADDED blocks of a file, in line order. A block is a run of consecutive tagged lines; when the
 * run ends on a comment-only line (`// ADDED: helper the doc never shows` above the code), it also
 * covers the lines below it up to the first blank line, at most 6. A file whose header comment says
 * ADDED is one block: the header plus its first lines, never the whole file.
 */
export function addedBlocks(lines: readonly string[]): AddedBlock[] {
  const out: AddedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!ADDED_TAG.test(lines[i])) continue;
    let j = i;
    // ` * ADDED:` inside a block comment: start the block at the comment's opening line.
    const start = i;
    if (/^\s*\*\s*ADDED:/.test(lines[i])) {
      for (let k = i - 1; k >= 0 && k >= i - 5; k--) {
        if (/^\s*(?:\/\*|\{\/\*)/.test(lines[k])) { i = k; break; }
        if (!/^\s*\*/.test(lines[k])) break;
      }
    }
    while (j + 1 < lines.length && ADDED_TAG.test(lines[j + 1])) j++;
    if (COMMENT_ONLY.test(lines[j])) {
      let k = 0;
      while (k < MAX_FOLLOW && j + 1 < lines.length && lines[j + 1].trim() !== '' && !CHANGED_TAG.test(lines[j + 1])) {
        j++;
        k++;
      }
    }
    const prev = out[out.length - 1];
    if (prev && i + 1 <= prev.to + 1) prev.to = Math.max(prev.to, j + 1);
    else out.push({ from: i + 1, to: j + 1, text: lines[start].trim() });
    i = j;
  }
  return out;
}

/**
 * Blocks to select in one IDE tab: the ADDED blocks, plus legacy `addedText` lines (exact text of
 * one line each) that are not already inside a block. `missing` lists addedText entries not found.
 */
export function selectionsFor(
  lines: readonly string[],
  addedText: string | string[] | undefined,
): { blocks: AddedBlock[]; missing: string[] } {
  const blocks = addedBlocks(lines);
  const missing: string[] = [];
  const wanted = addedText == null ? [] : Array.isArray(addedText) ? addedText : [addedText];
  for (const want of wanted) {
    const n = lines.findIndex((l) => l.includes(want)) + 1;
    if (n <= 0) {
      missing.push(want);
      continue;
    }
    if (blocks.some((b) => n >= b.from && n <= b.to)) continue;
    blocks.push({ from: n, to: n, text: lines[n - 1].trim() });
  }
  blocks.sort((a, b) => a.from - b.from);
  return { blocks, missing };
}
