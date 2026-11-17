/** Page group "interact": recorder entries (same shape as PAGES in pages.config.ts). Owned by the interact builder. */
import { type PageDefinition } from '../core/types';

const C = 'my-copilot-app/src/components/interact';
const P = 'my-copilot-app/src/pages';
const B = 'backend/interact';
const COMMON = { filePath: `${B}/demo_agents/_common.py`, startLine: 1, endLine: 9, addedText: '# HARNESS: `demo_agents._common` (MODEL, chat_settings) is imported by the agent code on the Vue OpenAI Agents pages' };

export const PAGES_INTERACT: PageDefinition[] = [
  {
    id: 'shared-state', name: 'Shared State (Vue)', videoName: 'SharedState', videoFile: '22-SharedState',
    docPath: 'shared-state', route: '/shared-state',
    ideFile: `${C}/shared-state/SharedWorkspace.vue`, startLine: 1, endLine: 34,
    extraTabs: [
      { filePath: `${B}/shared_state.py`, startLine: 1, endLine: 57, addedText: '# HARNESS: imports, MODEL / chat_settings are never shown on the page' },
      COMMON,
      { filePath: `${P}/SharedStateApp.vue`, startLine: 1, endLine: 12 },
    ],
    prompt: 'Please remember that my favourite colour is green.',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'shared-state-rendering', name: 'Render agent state in your app (Vue)', videoName: 'SharedStateRendering', videoFile: '23-SharedStateRendering',
    docPath: 'shared-state/rendering-in-app', route: '/shared-state-rendering',
    ideFile: `${C}/rendering/Canvas.vue`, startLine: 1, endLine: 53,
    extraTabs: [{ filePath: `${P}/RenderingInAppApp.vue`, startLine: 1, endLine: 14 }],
    prompt: 'What is the title of my project and which items are on the list?',
    waitAfterPromptMs: 4000,
  },
  {
    id: 'shared-state-streaming', name: 'State Streaming (Vue)', videoName: 'SharedStateStreaming', videoFile: '24-SharedStateStreaming',
    docPath: 'shared-state/streaming', route: '/shared-state-streaming',
    ideFile: `${C}/streaming/StreamingDocument.vue`, startLine: 1, endLine: 24,
    extraTabs: [
      { filePath: `${B}/shared_state_streaming.py`, startLine: 1, endLine: 72, addedText: '# HARNESS: the page mounts `DocumentStreamingAgent(shared_state_streaming_agent)` but never shows that agent' },
      { filePath: `${P}/StreamingApp.vue`, startLine: 1, endLine: 12 },
    ],
    prompt: 'Write a short four line poem about the sea.',
    waitAfterPromptMs: 5000,
  },
  {
    id: 'shared-state-readonly', name: 'Agent Read-Only Context (Vue)', videoName: 'SharedStateReadonly', videoFile: '25-SharedStateReadonly',
    docPath: 'shared-state/agent-readonly', route: '/shared-state-readonly',
    ideFile: `${C}/readonly/WorkspaceContext.vue`, startLine: 1, endLine: 15,
    extraTabs: [{ filePath: `${P}/AgentReadonlyApp.vue`, startLine: 1, endLine: 12 }],
    prompt: 'Which workspace am I in right now?',
    waitAfterPromptMs: 3000,
  },
  {
    id: 'hitl', name: 'HITL Overview (Vue)', videoName: 'HumanInTheLoop', videoFile: '26-HumanInTheLoop',
    docPath: 'human-in-the-loop', route: '/hitl',
    ideFile: `${C}/hitl/MeetingApproval.vue`, startLine: 1, endLine: 17,
    extraTabs: [
      { filePath: `${B}/hitl.py`, startLine: 1, endLine: 19 },
      COMMON,
      { filePath: `${C}/hitl/TimePickerCard.vue`, startLine: 1, endLine: 21, addedText: '<!-- HARNESS: the HITL overview imports ./TimePickerCard.vue but never shows it. Minimal picker' },
    ],
    prompt: 'Please book an onboarding call with the sales team, my name is Sam.',
    waitAfterPromptMs: 5000,
  },
  {
    id: 'governed-actions', name: 'Governed Actions (Vue)', videoName: 'GovernedActions', videoFile: '27-GovernedActions',
    docPath: 'human-in-the-loop/governed-actions', route: '/governed-actions',
    ideFile: `${C}/governed/GovernedActionTool.vue`, startLine: 1, endLine: 24,
    extraTabs: [
      { filePath: `${C}/governed/GovernedActionCard.vue`, startLine: 1, endLine: 46 },
      { filePath: `${C}/governed/GovernedActionApproval.vue`, startLine: 1, endLine: 58 },
      { filePath: `${P}/GovernedActionsApp.vue`, startLine: 1, endLine: 14 },
    ],
    prompt: 'Send an email to bob at example dot com saying hi. Before sending, call approve_governed_action with id a1, summary Send email to Bob, tool send_email, reference POL-7, verdict require_approval.',
    waitAfterPromptMs: 5000,
  },
  {
    id: 'webmcp', name: 'WebMCP (Vue)', videoName: 'WebMcp', videoFile: '28-WebMcp',
    docPath: 'webmcp', route: '/webmcp',
    ideFile: `${C}/webmcp/OrderSearch.vue`, startLine: 1, endLine: 21,
    extraTabs: [{ filePath: `${P}/WebmcpApp.vue`, startLine: 1, endLine: 12, addedText: '// HARNESS: the WebMCP page shows OrderSearch.vue only ("must run inside your existing CopilotKitProvider"); provider + chat from the quickstart.' }],
    prompt: 'Use the searchOrders tool to find my open orders.',
    waitAfterPromptMs: 5000,
  },
  {
    id: 'subagents', name: 'Sub-Agents (Vue)', videoName: 'SubAgents', videoFile: '29-SubAgents',
    docPath: 'multi-agent/subagents', route: '/subagents',
    ideFile: `${B}/subagents.py`, startLine: 1, endLine: 60,
    extraTabs: [
      COMMON,
      { filePath: `${P}/SubagentsApp.vue`, startLine: 1, endLine: 10, addedText: '// HARNESS: the Sub-Agents page shows no frontend code at all ("Rendering a live delegation log" is empty); provider + chat from the quickstart.' },
    ],
    prompt: 'Write a short paragraph about why the sky is blue.',
    waitAfterPromptMs: 15000,
  },
];
