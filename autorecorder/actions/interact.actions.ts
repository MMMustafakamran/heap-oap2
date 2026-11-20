/** Page group "interact": per-page handlers (page id -> handler), FINDING_EVIDENCE via registerDocEvidence. */
import { type PageActionHandler } from '../core/types';
import { runStandardAction, sendPrompt } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type DocEvidence, showFinding } from './doc-evidence';
import { registerDocEvidence } from '../core/doc-evidence';
import { glideClick, glideTo } from './glide-click';

/** Texts checked against the rendered pages (2026-11-17). */
export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
};

// Evidence is highlighted by the engine inside the doc step, before the IDE (AUTORECORDER §2).
registerDocEvidence(FINDING_EVIDENCE);

const NOTES: Record<string, string> = {
};

const withNote = (id: string, inner: PageActionHandler = runStandardAction): PageActionHandler =>
  async (page, config, root, ctx) => {
    try {
      await inner(page, config, root, ctx);
    } finally {
      await showFinding(page, config, undefined, NOTES[id], `finding-${id}.txt`);
    }
  };

/** Send the prompt, then click the button the HITL card renders and let the run finish. */
const clickThrough = (button: RegExp | string, settleMs: number): PageActionHandler =>
  async (page, config, root, ctx) => {
    // The run pauses on the card, so no text reply comes before the click: send only, then click.
    void root;
    await sendPrompt(page, config.prompt ?? '', { timeoutMs: 20_000 });
    const btn = page.getByRole('button', { name: button }).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 60_000 });
    } catch {
      ctx.fail(`No "${String(button)}" button rendered.`);
      return;
    }
    await glideTo(page, btn, 1200);
    await glideClick(page, btn);
    await sleep(settleMs);
  };

export const ACTIONS_INTERACT: Record<string, PageActionHandler> = {
  hitl: clickThrough(/Tomorrow at 09:00/, 12_000),
  'governed-actions': clickThrough('Approve and run', 12_000),
  // webmcp, subagents: ✅ since 2026-11-20 (minor notes), standard take, no Notepad.
};
