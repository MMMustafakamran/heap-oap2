/**
 * Pages of https://docs.copilotkit.ai/vue/openai-agents-python under test. One Vite app (5130), one root per
 * route (my-copilot-app/src/App.vue). Runtime: my-copilot-app/server.openai.ts (8130), HttpAgents to this repo's
 * Python agents (8131 quickstart agent, 8132-8139 page agents). HARNESS: the rendered Vue quickstart shows no
 * Vue runtime or Python agent (FINDINGS.md #1).
 * Page agents: append one entry per page below (id = assignment.json pages[].id, route = App.vue route).
 */
import { definePages } from '../core/types';

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
      { filePath: 'my-copilot-app/doc-verbatim/route.ts', startLine: 1, endLine: 25 },
      { filePath: 'my-copilot-app/server.openai.ts', startLine: 1, endLine: 40 },
      { filePath: 'my-copilot-app/src/pages/QuickstartApp.vue', startLine: 1, endLine: 15 },
      { filePath: 'backend/main.py', startLine: 1, endLine: 20 },
    ],
    prompt: 'Tell me in one sentence what this app can do.',
    waitAfterPromptMs: 3000,
  },
]);
