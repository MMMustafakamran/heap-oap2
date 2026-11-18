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
  'agent-config': [
    { text: 'The page publishes its typed config with useAgentContext', caption: 'no Vue code for it; the Code tab only has React page.tsx / use-agent-config.ts' },
    { text: 'model=MODEL,', caption: 'MODEL and chat_settings come from demo_agents._common, never shown' },
  ],
};
registerDocEvidence(FINDING_EVIDENCE);

const NOTES: Record<string, string> = {
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
  'agent-config': runAgentConfig,
  inspector: runInspector,
};
