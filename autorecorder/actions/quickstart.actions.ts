import { type PageActionHandler } from '../core/types';
import { runStandardAction } from '../core/actions';
import { type DocEvidence, showFinding } from './doc-evidence';
import { registerDocEvidence } from '../core/doc-evidence';

/** Texts checked against the rendered page (2026-11-18). FINDINGS.md #1. */
export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  quickstart: [
    { text: 'Already have an agent? Do not use BuiltInAgent', caption: 'The page only sets up BuiltInAgent and says not to use it with your own agent' },
    { text: "use your framework's quickstart for the runtime wiring", caption: 'It points to the framework quickstart, which is this page: no OpenAI Agents SDK wiring' },
  ],
};

// Evidence is highlighted by the engine inside the doc step, before the IDE (AUTORECORDER §2).
registerDocEvidence(FINDING_EVIDENCE);

/** Generic wording (owner rule): what the page shows vs what a Vue reader needs. */
const QUICKSTART_FINDING = [
  'openai agents vue quickstart should show how to hook my openai agents sdk agent into a vue app',
  'instead it only sets up builtinagent,copilotkits own agent that calls the model directly',
  'callout even says if u already have an agent dont use builtinagent,use your frameworks quickstart for the wiring',
  'but this is the framework quickstart,no httpagent no python agent no ag_ui_openai_agents anywhere',
  'so the chat replies but its not talking to an openai agents agent at all',
].join('\n');

export const runVueQuickstartAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await runStandardAction(page, config, root, ctx);
  } finally {
    await showFinding(page, config, undefined, QUICKSTART_FINDING, 'finding-vue-quickstart.txt');
  }
};
