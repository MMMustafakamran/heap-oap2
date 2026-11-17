/** Page group "genui": per-page handlers (page id -> handler), FINDING_EVIDENCE via registerDocEvidence. */
import { type PageActionHandler } from '../core/types';
import { runStandardAction, sendPrompt } from '../core/actions';
import { showFinding } from './doc-evidence';
import { type DocEvidenceItem, registerDocEvidence } from '../core/doc-evidence';

/** Texts checked against the rendered pages (2026-11-17). */
export const FINDING_EVIDENCE: Record<string, DocEvidenceItem[]> = {
  'state-rendering': [
    { text: 'type ResearchState = { status?: string; draft?: string; completed?: number; total?: number };', caption: 'The UI reads status/draft/completed/total' },
    { text: 'shared_state().update(document=document)', caption: 'The agent only ever writes document' },
  ],
  'generative-ui-components': [
    { text: 'const { messages, systemPrompts, tools } = convertInputToTanStackAI(input);', caption: 'Vue server.ts: chat() gets no threadId; @tanstack/ai now requires one', clickTab: 'Vue' },
  ],
  'a2ui-fixed': [
    { text: 'Implement the React renderers', caption: 'The catalog renderers are React only (renderers.tsx), no Vue code' },
    { text: '<CopilotKit runtimeUrl="/api/copilotkit" a2ui={{ catalog: myCatalog }}>', caption: 'The catalog is registered on the React provider only' },
  ],
};

// Evidence is highlighted by the engine inside the doc step, before the IDE (AUTORECORDER §2).
registerDocEvidence(FINDING_EVIDENCE);

/** Hurried notes (AUTORECORDER §2): doc says -> happened -> why. */
const NOTES: Record<string, string> = {
  'state-rendering': [
    'state rendering page says the progress panel follows the agents state live',
    'asked for a draft,agent wrote it but the panel just stays on idle with an empty bar',
    'the vue component reads status draft completed and total',
    'but the agent code on the page only writes document into state,so nothing matches',
    'page also never shows the shared_state_streaming_agent it wraps,had to write that myself',
  ].join('\n'),
  'generative-ui-components': [
    'components page says run the vue server.ts and ask for a plans table,the table should render',
    'instead nothing comes back,run_error chat() needs a threadId',
    'the server.ts on the vue tab calls chat from tanstack ai without a threadId',
    'tanstack ai that npm install gives u today requires it so every run fails',
    'also its a builtinagent,no openai agents sdk agent anywhere on the page',
  ].join('\n'),
  'a2ui-fixed': [
    'fixed schema page says the agent returns the flight schema and a flight card renders',
    'in vue i get a red box,a2ui render error catalog not found copilotkit flight-fixed-catalog',
    'the catalog definitions renderers and provider code are all react,page.tsx renderers.tsx',
    'theres no vue way shown to register that catalog so the card cant render',
    'agent file also imports demo_agents._common which is never shown,had to stub it',
  ].join('\n'),
};

const withNote =
  (id: string): PageActionHandler =>
  async (page, config, root, ctx) => {
    try {
      await runStandardAction(page, config, root, ctx);
    } finally {
      await showFinding(page, config, undefined, NOTES[id]);
    }
  };

/** Card-only replies (MCP app iframe, A2UI surface): the agent answers with a rendered card and no
 * text, so wait for the card instead of an assistant text message. */
const runCardReply: PageActionHandler = async (page, config, _root, ctx) => {
  await sendPrompt(page, config.prompt ?? '', { timeoutMs: 20_000 });
  const ok = await page
    .waitForFunction(
      () =>
        !!document.querySelector('iframe, [class*="a2ui" i], [data-a2ui], [class*="surface" i]') ||
        /Key Metrics|Revenue|Churn/i.test(document.body.innerText.split('Show me a small dashboard').pop() ?? ''),
      null,
      { timeout: 90_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) ctx.fail('No card rendered for the prompt');
  await page.waitForTimeout(8000);
};

export const ACTIONS_GENUI: Record<string, PageActionHandler> = {
  'tool-based': runCardReply,
  'mcp-apps': runCardReply,
  a2ui: runCardReply,
  'a2ui-dynamic': runCardReply,
  'state-rendering': withNote('state-rendering'),
  'generative-ui-components': withNote('generative-ui-components'),
  'a2ui-fixed': withNote('a2ui-fixed'),
};
