/** Page group "genui": recorder entries (same shape as PAGES in pages.config.ts). Owned by the genui builder. */
import { type PageDefinition } from '../core/types';

const G = 'my-copilot-app/src/pages/genui';
const B = 'backend/genui';

export const PAGES_GENUI: PageDefinition[] = [
  {
    id: 'frontend-tools', name: 'Frontend Tools (Vue)', videoName: 'FrontendTools', videoFile: '12-FrontendTools',
    docPath: 'frontend-tools', route: '/frontend-tools',
    ideFile: `${G}/frontend-tools/components/DashboardAgent.vue`, startLine: 1, endLine: 27,
    extraTabs: [{ filePath: `${G}/frontend-tools/App.vue`, startLine: 1, endLine: 11 }],
    prompt: 'Show only sev1 incidents.',
    waitAfterPromptMs: 3000,
  },
  {
    id: 'tool-based', name: 'Components as Tools (Vue)', videoName: 'ToolBased', videoFile: '13-ToolBased',
    docPath: 'generative-ui/tool-based', route: '/tool-based',
    ideFile: `${G}/tool-based/components/AgentExperience.vue`, startLine: 1, endLine: 18,
    extraTabs: [
      { filePath: `${G}/tool-based/components/WeatherCard.vue`, startLine: 1, endLine: 10 },
      { filePath: `${G}/tool-based/App.vue`, startLine: 1, endLine: 11 },
    ],
    prompt: 'Show me the weather card for Paris: 21 degrees, sunny.',
    waitAfterPromptMs: 3000,
  },
  {
    id: 'tool-rendering', name: 'Tool Call Rendering (Vue)', videoName: 'ToolRendering', videoFile: '14-ToolRendering',
    docPath: 'generative-ui/tool-rendering', route: '/tool-rendering',
    ideFile: `${G}/tool-rendering/components/AgentExperience.vue`, startLine: 1, endLine: 15,
    extraTabs: [
      { filePath: `${G}/tool-rendering/components/WeatherToolCard.vue`, startLine: 1, endLine: 15 },
      { filePath: `${B}/tool_rendering.py`, startLine: 1, endLine: 45, addedText: 'SYSTEM_PROMPT = "You are a helpful concierge. Use your tools when they fit the question."' },
    ],
    prompt: 'What is the weather in Tokyo?',
    waitAfterPromptMs: 3000,
  },
  {
    id: 'state-rendering', name: 'State Rendering (Vue)', videoName: 'StateRendering', videoFile: '15-StateRendering',
    docPath: 'generative-ui/state-rendering', route: '/state-rendering',
    ideFile: `${G}/state-rendering/components/ResearchProgress.vue`, startLine: 1, endLine: 22,
    extraTabs: [
      { filePath: `${G}/state-rendering/App.vue`, startLine: 1, endLine: 12 },
      { filePath: `${B}/shared_state_streaming.py`, startLine: 1, endLine: 70, addedText: 'shared_state_streaming_agent = Agent(' },
    ],
    prompt: 'Write a short three sentence draft about why the sky is blue.',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'mcp-apps', name: 'MCP Apps (Vue)', videoName: 'McpApps', videoFile: '16-McpApps',
    docPath: 'generative-ui/mcp-apps', route: '/mcp-apps',
    ideFile: 'my-copilot-app/server.openai.ts', startLine: 1, endLine: 60,
    extraTabs: [{ filePath: `${G}/mcp-apps/App.vue`, startLine: 1, endLine: 10 }],
    prompt: 'Use Excalidraw to draw a simple flowchart with three boxes: Start, Process, End.',
    waitAfterPromptMs: 25000,
  },
  {
    id: 'generative-ui-components', name: 'Components and surfaces (Vue)', videoName: 'GenerativeUiComponents', videoFile: '17-GenerativeUiComponents',
    docPath: 'generative-ui/components', route: '/generative-ui-components',
    ideFile: `${G}/components/App.vue`, startLine: 1, endLine: 15,
    extraTabs: [{ filePath: `${G}/components/server.ts`, startLine: 1, endLine: 41 }],
    prompt: 'Compare the Starter, Team, and Enterprise plans in a table',
    waitAfterPromptMs: 6000,
  },
  {
    id: 'reasoning', name: 'Reasoning (Vue)', videoName: 'Reasoning', videoFile: '18-Reasoning',
    docPath: 'generative-ui/reasoning', route: '/reasoning',
    ideFile: `${G}/reasoning/App.vue`, startLine: 1, endLine: 10,
    extraTabs: [{ filePath: `${G}/reasoning/AgentChat.vue`, startLine: 1, endLine: 14 }],
    prompt: 'A bat and a ball cost 1.10 in total. The bat costs 1.00 more than the ball. How much is the ball? Think step by step.',
    waitAfterPromptMs: 3000,
  },
  {
    id: 'a2ui', name: 'A2UI (Vue)', videoName: 'A2ui', videoFile: '19-A2ui',
    docPath: 'generative-ui/a2ui', route: '/a2ui',
    ideFile: `${G}/a2ui/App.vue`, startLine: 1, endLine: 12,
    extraTabs: [{ filePath: 'my-copilot-app/server.openai.ts', startLine: 66, endLine: 74, addedText: 'RUNTIME_OPTIONS["/a2ui"] = { a2ui: { injectA2UITool: true } };' }],
    prompt: 'Show me a small dashboard card with three metrics: users 120, revenue 4500, churn 2%.',
    waitAfterPromptMs: 8000,
  },
  {
    id: 'a2ui-dynamic', name: 'Dynamic Schema A2UI (Vue)', videoName: 'A2uiDynamic', videoFile: '20-A2uiDynamic',
    docPath: 'generative-ui/a2ui/dynamic-schema', route: '/a2ui-dynamic',
    ideFile: `${G}/a2ui-dynamic/App.vue`, startLine: 1, endLine: 12,
    extraTabs: [{ filePath: 'my-copilot-app/server.openai.ts', startLine: 66, endLine: 74 }],
    prompt: 'Show me a small dashboard card with three metrics: users 120, revenue 4500, churn 2%.',
    waitAfterPromptMs: 8000,
  },
  {
    id: 'a2ui-fixed', name: 'Fixed Schema A2UI (Vue)', videoName: 'A2uiFixed', videoFile: '21-A2uiFixed',
    docPath: 'generative-ui/a2ui/fixed-schema', route: '/a2ui-fixed',
    ideFile: `${G}/a2ui-fixed/App.vue`, startLine: 1, endLine: 12,
    extraTabs: [
      { filePath: 'backend/genui/demo_agents/a2ui_fixed.py', startLine: 1, endLine: 91 },
      { filePath: 'backend/genui/demo_agents/_common.py', startLine: 1, endLine: 9, addedText: 'MODEL = "gpt-4.1-mini"' },
    ],
    prompt: 'Show me a flight from SFO to JFK on United for $289.',
    waitAfterPromptMs: 8000,
  },
];
