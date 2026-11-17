/** Page group "interact": per-page handlers (page id -> handler), FINDING_EVIDENCE via registerDocEvidence. */
import { type PageActionHandler } from '../core/types';
import { runStandardAction } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { type DocEvidence, showFinding } from './doc-evidence';
import { registerDocEvidence } from '../core/doc-evidence';
import { glideClick, glideTo } from './glide-click';

/** Texts checked against the rendered pages (2026-11-17). */
export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  hitl: [
    { text: 'import TimePickerCard from "./TimePickerCard.vue";', caption: 'MeetingApproval.vue imports TimePickerCard.vue, never shown' },
    { text: 'from demo_agents._common import MODEL, chat_settings', caption: 'hitl.py imports demo_agents._common, never shown' },
  ],
  webmcp: [
    { text: 'const orders = await searchOrders(status);', caption: 'searchOrders() is never defined or imported' },
  ],
  subagents: [
    { text: 'the delegation log is a reactive render of the', caption: 'The delegation-log section has no code' },
    { text: 'from demo_agents._common import MODEL, chat_settings', caption: 'subagents.py imports demo_agents._common, never shown' },
  ],
};

// Evidence is highlighted by the engine inside the doc step, before the IDE (AUTORECORDER §2).
registerDocEvidence(FINDING_EVIDENCE);

const NOTES: Record<string, string> = {
  hitl: [
    'hitl page says the agent calls a frontend tool and a time picker card shows in chat',
    'the card does show but only after i wrote the picker myself',
    'meetingapproval.vue imports ./timepickercard.vue,page never shows that file',
    'and hitl.py imports demo_agents._common for model and chat_settings,also not shown anywhere',
    'agent prompt even says book_call while the vue tool is schedule_meeting',
    'so u cant build this page as written,had to guess the card and the common file',
  ].join('\n'),
  webmcp: [
    'webmcp page says add webmcp to useFrontendTool and the same handler works for the agent',
    'asked the agent to use searchOrders,no reply at all,chat just sits there',
    'handler calls searchOrders(status) but that function is never defined or imported on the page',
    'so the tool throws inside the handler and the run dies silently',
  ].join('\n'),
  subagents: [
    'subagents page says supervisor delegates and the ui shows a live delegation log',
    'agent does reply but theres no log on screen,nothing to render it with',
    'rendering a live delegation log section is just text,no vue code at all',
    'also subagents.py imports demo_agents._common model and chat_settings,never shown',
    'so the main part of the page,the log,cant be built from the doc',
  ].join('\n'),
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
    await runStandardAction(page, config, root, ctx);
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
  hitl: withNote('hitl', clickThrough(/Tomorrow 10:00 AM/, 12_000)),
  'governed-actions': clickThrough('Approve and run', 12_000),
  webmcp: withNote('webmcp'),
  subagents: withNote('subagents'),
};
