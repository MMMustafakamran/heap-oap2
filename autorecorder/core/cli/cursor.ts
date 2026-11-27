/**
 * Minimal cursor tracker for a PTY with no terminal emulator attached.
 *
 * PowerShell's line editor (PSReadLine) asks the terminal where the cursor is
 * (`ESC[6n`, device status report) and waits ~1 s for an `ESC[row;colR` reply
 * before giving up. A bare node-pty on Linux has nobody to answer, so on CI the
 * prompt came up 10-15 s late (or never) and typed input was redrawn at the
 * wrong place (garbled text). This tracker follows the output closely enough to
 * answer: printable characters, CR/LF/BS/TAB, cursor moves (CSI A/B/C/D/E/F/G/H/f/d),
 * erase (CSI J) and scrolling at the last row. Wide characters count as one cell
 * (close enough for a prompt line).
 *
 * Windows ConPTY answers these itself, so callers only use it elsewhere.
 */
export class CursorTracker {
  private row = 1;
  private col = 1;
  private saved: [number, number] = [1, 1];
  /** Unfinished escape sequence carried over from the previous chunk. */
  private pending = '';

  constructor(
    private cols: number,
    private rows: number,
  ) {}

  /** Feeds PTY output; returns the replies owed for every `ESC[6n` in it, in order. */
  feed(data: string): string[] {
    const replies: string[] = [];
    const s = this.pending + data;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\x1b') {
        const rest = s.slice(i);
        if (rest.length < 2) {
          this.pending = rest;
          break;
        }
        if (rest[1] === '[') {
          const m = /^\x1b\[([?>=]?)([0-9;]*)([ -\/]*)([@-~])/.exec(rest);
          if (!m) {
            if (rest.length < 32) this.pending = rest; // sequence split across chunks
            else i += 2;
            if (this.pending) break;
            continue;
          }
          this.csi(m[1], m[2], m[4], replies);
          i += m[0].length;
          continue;
        }
        if (rest[1] === ']') {
          // OSC: ends with BEL or ST
          const end = rest.search(/\x07|\x1b\\/);
          if (end < 0) {
            this.pending = rest;
            break;
          }
          i += end + (rest[end] === '\x07' ? 1 : 2);
          continue;
        }
        if (rest[1] === '7') this.saved = [this.row, this.col];
        else if (rest[1] === '8') [this.row, this.col] = this.saved;
        i += 2;
        continue;
      }
      if (ch === '\r') this.col = 1;
      else if (ch === '\n') this.lineFeed();
      else if (ch === '\b') this.col = Math.max(1, this.col - 1);
      else if (ch === '\t') this.col = Math.min(this.cols, (Math.floor((this.col - 1) / 8) + 1) * 8 + 1);
      else if (ch >= ' ' && ch !== '\x7f') {
        if (this.col > this.cols) {
          this.col = 1;
          this.lineFeed();
        }
        this.col++;
      }
      i++;
    }
    return replies;
  }

  private lineFeed(): void {
    if (this.row < this.rows) this.row++;
  }

  private csi(prefix: string, params: string, final: string, replies: string[]): void {
    const p = params.split(';').map((x) => (x === '' ? NaN : Number(x)));
    const n = (k: number, d = 1): number => (Number.isFinite(p[k]) && p[k] > 0 ? p[k] : d);
    const clampRow = (r: number): number => Math.max(1, Math.min(this.rows, r));
    const clampCol = (c: number): number => Math.max(1, Math.min(this.cols, c));
    if (prefix) return; // private modes (?25h etc.) don't move the cursor
    switch (final) {
      case 'n':
        if (p[0] === 6) replies.push(`\x1b[${this.row};${Math.min(this.col, this.cols)}R`);
        break;
      case 'A': this.row = clampRow(this.row - n(0)); break;
      case 'B': this.row = clampRow(this.row + n(0)); break;
      case 'C': this.col = clampCol(this.col + n(0)); break;
      case 'D': this.col = clampCol(this.col - n(0)); break;
      case 'E': this.row = clampRow(this.row + n(0)); this.col = 1; break;
      case 'F': this.row = clampRow(this.row - n(0)); this.col = 1; break;
      case 'G': this.col = clampCol(n(0)); break;
      case 'd': this.row = clampRow(n(0)); break;
      case 'H':
      case 'f':
        this.row = clampRow(n(0));
        this.col = clampCol(n(1));
        break;
      case 'J':
        if (p[0] === 2 || p[0] === 3) { /* clear screen: cursor stays */ }
        break;
      case 's': this.saved = [this.row, this.col]; break;
      case 'u': [this.row, this.col] = this.saved; break;
      default: break;
    }
  }
}
