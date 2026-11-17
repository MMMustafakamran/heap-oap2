# FINDINGS — OpenAIAgents-Vue

Open doc defects found implementing https://docs.copilotkit.ai/vue/openai-agents-python (Vue frontend + OpenAI Agents SDK Python backend).
Stack: @copilotkit/vue 1.88.0, @copilotkit/runtime 1.88.0 (declared ^1.88.0), @ag-ui/client 1.0.4, vue 3.5.45, vite 8.3.8; openai-agents 0.24.0, ag-ui-openai-agents 0.1.0, fastapi 0.163.1, uvicorn 0.54.0; Python 3.13.15, Node 26.7.0, npm 12.0.2; Microsoft Windows 11 Pro. Docs: https://docs.copilotkit.ai/vue/openai-agents-python (snapshot 2026-11-17).

## Dev blockers

### [Quickstart](https://docs.copilotkit.ai/vue/openai-agents-python)
**#1 The Vue quickstart has no Vue steps and no Python agent.**
- **Doc:** the sidebar's Quickstart renders the landing page ("Bring your OpenAI Agents SDK agents into any app", a "Start building" setup-prompt wizard). Its only code ("Connect your agent") is a Next.js route handler: `import type { NextRequest } from "next/server";` ... `export const POST = (req: NextRequest) => handler(req);`. No `@copilotkit/vue` install, no Node runtime for Vite, no `Agent` / `ag_ui_openai_agents` code. "Read the setup guide" (`/vue/openai-agents-python/quickstart`) lands back on the same landing page. The `.md` export instead shows the generic Vue quickstart, which registers `BuiltInAgent` and says to "use your framework's quickstart for the runtime wiring".
- **Result:** a reader can't get a Vue app talking to an OpenAI Agents SDK agent from the Vue docs. **Confirmed by harness:** `my-copilot-app/server.openai.ts` (the `.md` export's `createCopilotNodeListener` server with the landing page's `HttpAgent`) + the React quickstart's `main.py` (`OpenAIAgentsAgent` + `add_openai_agents_fastapi_endpoint`) replies normally.

### [Programmatic Control](https://docs.copilotkit.ai/vue/openai-agents-python/programmatic-control)
**#3 agent_server.py uses `lifespan` and `AGENTS`, never defined; no agent for `agentId: "sales"`.**
- **Doc:** `app = FastAPI(title="OpenAI Agents SDK Agent Server", lifespan=lifespan)` / `for name, agent in AGENTS.items(): add_openai_agents_fastapi_endpoint(app, agent, f"/{name}", include_health=False)`.
- **Result:** the server can't start as written (`NameError`), and the frontend's `sales` agent is never given. **Confirmed by harness:** with `AGENTS` and `lifespan` added (`backend/pages_chat.py`), Run agent starts a run (`POST /sales 200`).

### [Chat Components](https://docs.copilotkit.ai/vue/openai-agents-python/agentic-chat-ui)
**#4 The only frontend code is React/Next.**
- **Doc:** `page.tsx`: `<CopilotKit runtimeUrl="/api/copilotkit" agent="agentic_chat"><Chat /></CopilotKit>`; Code tab `page.tsx`, `route.ts`, and `chat.py` importing `demo_agents._common` (never shown).
- **Result:** no Vue version; a Vue reader can't build the page. **Confirmed by harness:** a hand-written Vue `CopilotChat agent-id="agentic_chat"` replies.

### [Agent Config](https://docs.copilotkit.ai/vue/openai-agents-python/agent-config)
**#5 No Vue frontend; agent needs an unshown `_common` module.**
- **Doc:** "The page publishes its typed config with useAgentContext…"; the Code tab is React only (`@copilotkit/react-core/v2`, `use-agent-config.ts`); `agent_config.py` uses `model=MODEL, model_settings=chat_settings()` from `demo_agents._common`.
- **Result:** nothing to build in Vue, and the agent file doesn't import. **Confirmed by harness:** a Vue `useAgentContext` + stand-in `MODEL`/`chat_settings` replies.

### [State Rendering](https://docs.copilotkit.ai/vue/openai-agents-python/generative-ui/state-rendering)
**#6 The UI reads state keys the agent never writes.**
- **Doc:** `type ResearchState = { status?: string; draft?: string; completed?: number; total?: number };` vs the agent's `shared_state().update(document=document)`; the wrapped `shared_state_streaming_agent` is never shown.
- **Result:** the agent streams `document`, the panel stays `Idle` with an empty bar and no text reply (3/3 probes).

### [Components and surfaces](https://docs.copilotkit.ai/vue/openai-agents-python/generative-ui/components)
**#7 Vue tab's server.ts fails every run.**
- **Doc:** `return chat({ adapter: openaiText("gpt-6-luna"), messages, systemPrompts: [...], tools, abortController })` (no `threadId`); no OpenAI Agents SDK agent on the page.
- **Error:** `RUN_ERROR` "chat() needs a threadId. Pass a non-empty string, for example the id of the conversation." (`@tanstack/ai` as installed by the doc today). **Confirmed by harness:** with `threadId: input.threadId` the run completes.

### [Fixed Schema A2UI](https://docs.copilotkit.ai/vue/openai-agents-python/generative-ui/a2ui/fixed-schema)
**#8 Catalog, renderers and provider are React only.**
- **Doc:** "Implement the React renderers" (`renderers.tsx`, `catalog.ts`), `<CopilotKit runtimeUrl="/api/copilotkit" a2ui={{ catalog: myCatalog }}>`; `a2ui_fixed.py` imports `demo_agents._common` (never shown).
- **Result:** in Vue the card shows "A2UI render error: Catalog not found: copilotkit://flight-fixed-catalog", then the agent says it displayed the flight.

### [Human-in-the-loop](https://docs.copilotkit.ai/vue/openai-agents-python/human-in-the-loop)
**#9 The page needs files it never shows.**
- **Doc:** `import TimePickerCard from "./TimePickerCard.vue";` (MeetingApproval.vue) and `from demo_agents._common import MODEL, chat_settings` (hitl.py). The agent prompt names `book_call`, the Vue tool is `schedule_meeting`.
- **Result:** the Vite import and the Python import both fail as published. **Confirmed by harness:** with a hand-written picker and `_common.py`, the picker renders and booking completes.

### [WebMCP](https://docs.copilotkit.ai/vue/openai-agents-python/webmcp)
**#10 `searchOrders` is never defined.**
- **Doc:** `const orders = await searchOrders(status);` (Vue and core snippets), never defined or imported.
- **Result:** asking the agent to search orders gives no reply at all (3/3 probes), no visible error.

### [Sub-agents](https://docs.copilotkit.ai/vue/openai-agents-python/multi-agent/subagents)
**#11 No frontend code for the delegation log; `_common` never shown.**
- **Doc:** "On the frontend, the delegation log is a reactive render of the `delegations` slot." (no code follows); `from demo_agents._common import MODEL, chat_settings`.
- **Result:** the supervisor replies in chat, but no delegation log can be built from the page.

## Minor notes

- **#2 Dead links (404).** The landing page and Common Issues link to `/vue/openai-agents-python/model-selection` (gone). Links built with a doubled `/vue/` (`/vue/openai-agents-python/vue/...`) 404: generative-ui/tool-based, prebuilt-components/copilot-threads-drawer, AG-UI-Streams, custom-look-and-feel/css, custom-look-and-feel/slots, generative-ui/tool-rendering (from the landing page, Headless Threads, Threads Drawer, Headless UI, Which hook, Components as Tools).
- **#12** Prebuilt Components / Threads Drawer: `agent-id` "my-agent" / "support" that nothing registers.
- **#13** Slots: the disclaimer slot snippet (`#input` → `CopilotChatInput` → `#disclaimer`) renders nothing; two different snippets are both titled `SupportChat.vue`.
- **#14** Headless Threads: `server.ts` uses `agent` and `verifyAppSession` without defining them.
- **#15** VS Code Extension: `code --install-extension copilotkit.copilotkit` names an id not on the Marketplace (real: `copilotkit.copilotkit-vscode-extension`); "three sidebars" but two listed.
- **#16** Tool Rendering: `WeatherToolCard` reads `parameters.city`, the tool arg is `location` (empty heading); agent snippet uses undefined `SYSTEM_PROMPT`, `MODEL`, `chat_settings()`, `search_flights`, `get_stock_price`, `roll_d20`.
- **#17** MCP Apps: `agents: { default: agent }` uses an undefined `agent`; server URL is the `mcp.example.com` placeholder.
- **#18** Reasoning: no agent shown; the card needs a reasoning model with `ModelSettings(reasoning=Reasoning(summary="auto"))`.
- **#19** A2UI / Dynamic Schema: provider and catalog steps are React only (`app/page.tsx`), opt-out tool is LangGraph (`ag_ui_langgraph`); only the runtime `injectA2UITool` fallback works in Vue.
- **#20** Shared State: agent snippets use `MODEL`, `chat_settings`, `shared_state`, `RunContextWrapper`, `json` with no imports.
- **#21** State Streaming: `shared_state_streaming_agent` wrapped by `DocumentStreamingAgent` is never shown.
- **#22** Governed Actions: no agent shown; `handleApproval` calls `executeSideEffect`, never defined.
- **#23** All pages: `runtime-url="/api/copilotkit"` 404s on Vite (no proxy shown).

## Build-only
