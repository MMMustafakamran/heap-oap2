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
];
