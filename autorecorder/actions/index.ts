/**
 * Which handler serves which page id. Pages not listed here use runStandardAction
 * (send the page's prompt, wait for the reply).
 * Page agents: put each page group's handlers in its own actions/<group>.actions.ts and add them below.
 */
import { type ActionContext, type PageActionHandler, type PageRecordConfig } from '../core/types';
import { runStandardAction } from '../core/actions';
import { type Page } from 'playwright';

import { waitForPageReady } from './page-ready';
import { runVueQuickstartAction } from './quickstart.actions';
import { ACTIONS_CHAT } from './chat.actions';
import { ACTIONS_GENUI } from './genui.actions';
import { ACTIONS_INTERACT } from './interact.actions';

/** Keys are page ids from `config/pages.config.ts`. Doctor flags any orphans. */
export const ACTION_MAP: Record<string, PageActionHandler> = {
  quickstart: runVueQuickstartAction,
  ...ACTIONS_CHAT,
  ...ACTIONS_GENUI,
  ...ACTIONS_INTERACT,
};

const READY_SELECTOR: Record<string, string> = {
  'headless-ui': 'input[aria-label="Message"], input, textarea',
  'programmatic-control': 'button',
  slots: 'button, textarea',
};

export async function executePageAction(
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
  ctx: ActionContext,
): Promise<void> {
  // Vite serves modules lazily, so markup can be on screen before anything is wired to it.
  // Pages with no standard chat input: wait on what they do have, not the 30s input timeout.
  await waitForPageReady(page, { label: config.id, inputSelector: READY_SELECTOR[config.id] });

  const handler = ACTION_MAP[config.id] ?? runStandardAction;
  await handler(page, config, rootPath, ctx);
}
