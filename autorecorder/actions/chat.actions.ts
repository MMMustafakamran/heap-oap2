/** Page group "chat": per-page handlers (page id -> handler), FINDING_EVIDENCE via registerDocEvidence. */
import { type PageActionHandler, type PageRecordConfig } from '../core/types';
import { runStandardAction, sendPrompt } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { checkpoint, mark } from '../core/timeline';
import { type DocEvidence, showFinding } from './doc-evidence';
import { registerDocEvidence } from '../core/doc-evidence';
import { glideClick, glideTo } from './glide-click';
import { type Page } from 'playwright';

/** ❌ pages. Evidence texts checked against the rendered pages (2026-11-17). */
export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  'programmatic-control': [
    { text: 'app = FastAPI(title="OpenAI Agents SDK Agent Server", lifespan=lifespan)', caption: 'lifespan and AGENTS are never defined; no agent code for "sales"' },
  ],
  'agentic-chat-ui': [
    { text: '<CopilotKit runtimeUrl="/api/copilotkit" agent="agentic_chat">', caption: 'React/Next page.tsx on the Vue page' },
  ],
  'agent-config': [
    { text: 'The page publishes its typed config with useAgentContext', caption: 'no Vue code for it; the Code tab only has React page.tsx / use-agent-config.ts' },
    { text: 'model=MODEL,', caption: 'MODEL and chat_settings come from demo_agents._common, never shown' },
  ],
};
registerDocEvidence(FINDING_EVIDENCE);

const NOTES: Record<string, string> = {
  'programmatic-control': [
    'page says mount the openai agents agent once and the run agent button drives it from code',
    'the only backend code is agent_server.py and it uses lifespan and AGENTS that are never defined',
    'so the server dies on start with a nameerror,and theres no agent named sales anywhere',
    'had to write the agents dict and lifespan myself,then run agent works',
  ].join('\n'),
  'agentic-chat-ui': [
    'vue page says wrap the ui in copilotkit once and drop in copilotchat',
    'but the code is react,page.tsx with <CopilotKit runtimeUrl> and the code tab is react and next too',
    'none of it runs in a vue app,theres no vue version of this page at all',
    'i rewrote it by hand with copilotkitprovider to get the chat going',
  ].join('\n'),
  'agent-config': [
    'page says the ui publishes tone expertise and length with useagentcontext and the agent follows it',
    'theres no vue code for that at all,the code tab only has react page.tsx and use-agent-config.ts',
    'agent_config.py also uses MODEL and chat_settings from demo_agents._common which is never shown',
    'so a vue reader cant build it,i wrote the vue selects and the missing bits myself',
  ].join('\n'),
};

async function withFinding(page: Page, config: PageRecordConfig, run: () => Promise<void>) {
  try {
    await run();
  } finally {
    await showFinding(page, config, undefined, NOTES[config.id]);
  }
}

/** Programmatic Control: click the doc's "Run agent", Stop is enabled while it runs, then idle again. */
const runProgrammatic: PageActionHandler = async (page, config, _root, ctx) =>
  withFinding(page, config, async () => {
    const run = page.getByRole('button', { name: 'Run agent' });
    await run.waitFor({ state: 'visible', timeout: 15000 });
    await sleep(1200);
    mark('click', 'Run agent');
    await glideClick(page, run);
    const started = await page.getByRole('button', { name: 'Stop' }).isEnabled().catch(() => false);
    void checkpoint('run', 'Stop is enabled while the run is active', async () => started);
    const done = await page
      .waitForFunction(() => !(document.querySelector('button') as HTMLButtonElement | null)?.disabled, null, { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (!done) ctx.warn('Run agent stayed disabled for 60 s');
    await glideTo(page, run, 3000);
  });

const runFindingStandard: PageActionHandler = async (page, config, root, ctx) =>
  withFinding(page, config, () => runStandardAction(page, config, root, ctx));

/** Agent Config: switch tone to enthusiastic, then ask. */
const runAgentConfig: PageActionHandler = async (page, config, root, ctx) =>
  withFinding(page, config, async () => {
    const tone = page.getByLabel('Tone');
    await tone.waitFor({ state: 'visible', timeout: 15000 });
    mark('action', 'tone enthusiastic');
    await tone.selectOption('enthusiastic');
    await sleep(1200);
    await runStandardAction(page, config, root, ctx);
  });

/** Slots: the doc's welcome-screen button sends the message through the chat. */
const runSlots: PageActionHandler = async (page, _config, _root, ctx) => {
  const btn = page.getByRole('button', { name: 'Show my open tickets' });
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await sleep(1500);
  mark('click', 'welcome-screen button');
  await glideClick(page, btn);
  const reply = page.locator('[data-testid="copilot-assistant-message"]').last();
  const ok = await reply.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false);
  if (!ok) ctx.fail('The welcome-screen button sent nothing / no reply');
  else await glideTo(page, reply, 4000);
};

/** Headless UI: the doc's own <input aria-label="Message"> + Send, replies as <article data-role="assistant">. */
const runHeadless: PageActionHandler = async (page, config, _root, ctx) => {
  await sendPrompt(page, config.prompt, {
    inputSelector: 'input[aria-label="Message"]',
    submitSelector: 'button[type="submit"]',
    messageSelector: 'article[data-role="assistant"]',
    timeoutMs: 15000,
  });
  const ok = await page
    .waitForFunction(() => [...document.querySelectorAll('article[data-role="assistant"]')].some((a) => (a.textContent ?? '').trim().length > 2), null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) ctx.fail('No assistant reply rendered in the headless chat');
  else await glideTo(page, page.locator('article[data-role="assistant"]').last(), 3000);
};

/** Inspector: chat once, then open the Inspector launcher (cpk-web-inspector). */
const runInspector: PageActionHandler = async (page, config, root, ctx) => {
  await runStandardAction(page, config, root, ctx);
  const insp = page.locator('cpk-web-inspector').first();
  const there = (await insp.count()) > 0;
  void checkpoint('inspector', 'the Inspector launcher is on the page', async () => there);
  if (!there) return ctx.fail('No Inspector on the page in the Vue dev build');
  const box = await insp.boundingBox().catch(() => null);
  if (box) {
    mark('click', 'Inspector');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(5000);
  }
};

export const ACTIONS_CHAT: Record<string, PageActionHandler> = {
  slots: runSlots,
  'headless-ui': runHeadless,
  'programmatic-control': runProgrammatic,
  'agentic-chat-ui': runFindingStandard,
  'agent-config': runAgentConfig,
  inspector: runInspector,
};
