/**
 * Pages of https://docs.copilotkit.ai/vue/openai-agents-python under test. One Vite app (5130), one root per
 * route (my-copilot-app/src/App.vue). Quickstart: its own server.ts verbatim (BuiltInAgent, 8135). Other pages:
 * my-copilot-app/server.openai.ts (8130), HttpAgents to this repo's Python agents (8131 agent, 8132-8139 page
 * agents). HARNESS: the Vue quickstart never connects an OpenAI Agents SDK agent (FINDINGS.md #1).
 * Page agents: append one entry per page below (id = assignment.json pages[].id, route = App.vue route).
 */
import { definePages } from '../core/types';
import { PAGES_CHAT } from './pages-chat';
import { PAGES_GENUI } from './pages-genui';
import { PAGES_INTERACT } from './pages-interact';

export const SKIP_RECORDING: Record<string, string> = {};

export const PAGES = definePages([
  {
    id: 'quickstart',
    name: 'Quickstart (Vue)',
    videoName: 'Quickstart',
    docPath: '',
    route: '/',
    ideFile: 'my-copilot-app/VERSIONS.md',
    startLine: 6,
    endLine: 20,
    extraTabs: [
      { filePath: 'my-copilot-app/server.ts', startLine: 1, endLine: 26 },
      { filePath: 'my-copilot-app/src/main.ts', startLine: 1, endLine: 5 },
      { filePath: 'my-copilot-app/src/pages/QuickstartApp.vue', startLine: 1, endLine: 15 },
    ],
    prompt: 'Tell me in one sentence what this app can do.',
    waitAfterPromptMs: 3000,
  },
  ...PAGES_CHAT,
  ...PAGES_GENUI,
  ...PAGES_INTERACT,
]);
