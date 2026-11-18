# FINDINGS — OpenAIAgents-Vue

Open doc defects found implementing https://docs.copilotkit.ai/vue/openai-agents-python (Vue frontend + OpenAI Agents SDK Python backend).
Stack: @copilotkit/vue 1.89.0, @copilotkit/runtime 1.89.0 (npm latest), @ag-ui/client 1.0.5, vue 3.5.45, vite 8.3.8; openai-agents 0.25.0, ag-ui-openai-agents 0.1.0, fastapi 0.163.2, uvicorn 0.54.0; Python 3.13.15, Node 26.7.0, npm 12.0.2; Microsoft Windows 11 Pro. Docs: https://docs.copilotkit.ai/vue/openai-agents-python (snapshot 2026-11-18).

## Dev blockers

### [Quickstart](https://docs.copilotkit.ai/vue/openai-agents-python)
**#1 The Vue quickstart never connects an OpenAI Agents SDK agent.**
- **Doc:** the page (`/vue/openai-agents-python`) is the generic Vue quickstart: `server.ts` registers `default: new BuiltInAgent({ model: "openai:gpt-6-luna", ... })`. Its callout says "Already have an agent? Do not use BuiltInAgent ... use your framework's quickstart for the runtime wiring so it registers your agent instead", but this is the OpenAI Agents SDK framework's quickstart. No `HttpAgent`, no Python `Agent` / `ag_ui_openai_agents` endpoint anywhere on the page.
- **Result:** following the page gives a Vue chat that talks to CopilotKit's own BuiltInAgent (it replies), never to an OpenAI Agents SDK agent. **Confirmed by harness:** every other page runs on `my-copilot-app/server.openai.ts` (`HttpAgent` to the React quickstart's `main.py`: `OpenAIAgentsAgent` + `add_openai_agents_fastapi_endpoint`), which the reader would have to work out alone.

### [Agent Config](https://docs.copilotkit.ai/vue/openai-agents-python/agent-config)
**#5 No Vue frontend; agent needs an unshown `_common` module.**
- **Doc:** "The page publishes its typed config with useAgentContext…"; the Code tab is React only (`@copilotkit/react-core/v2`, `use-agent-config.ts`); `agent_config.py` uses `model=MODEL, model_settings=chat_settings()` from `demo_agents._common`.
- **Result:** nothing to build in Vue, and the agent file doesn't import. **Confirmed by harness:** a Vue `useAgentContext` + stand-in `MODEL`/`chat_settings` replies.

### [State Rendering](https://docs.copilotkit.ai/vue/openai-agents-python/generative-ui/state-rendering)
**#6 The UI reads state keys the agent never writes.**
- **Doc:** `type ResearchState = { status?: string; draft?: string; completed?: number; total?: number };` vs the agent's `shared_state().update(document=document)`; the wrapped `shared_state_streaming_agent` is never shown.
- **Result:** the agent streams `document`, the panel stays `Idle` with an empty bar and no text reply (3/3 probes).

### [WebMCP](https://docs.copilotkit.ai/vue/openai-agents-python/webmcp)
**#10 `searchOrders` is never defined.**
- **Doc:** `const orders = await searchOrders(status);` (Vue and core snippets), never defined or imported.
- **Result:** asking the agent to search orders gives no reply at all (3/3 probes), no visible error.

### [Sub-agents](https://docs.copilotkit.ai/vue/openai-agents-python/multi-agent/subagents)
**#11 No frontend code for the delegation log; `_common` never shown.**
- **Doc:** "On the frontend, the delegation log is a reactive render of the `delegations` slot." (no code follows); `from demo_agents._common import MODEL, chat_settings`.
- **Result:** the supervisor replies in chat, but no delegation log can be built from the page.

## Minor notes

- **#9** HITL Overview: `hitl.py` imports `demo_agents._common` (never shown), and its prompt names a `book_call` tool while the Vue tool is `schedule_meeting`. The page's `TimePickerCard.vue` now renders and booking completes.
- **#12** Prebuilt Components / Threads Drawer: `agent-id` "my-agent" / "support" that nothing registers. Prebuilt Components' new `useConfigureSuggestions` snippet shows no suggestion in the chat (probe 2026-11-18).
- **#13** Slots: two different snippets are both titled `SupportChat.vue`.
- **#14** Headless Threads: `server.ts` uses `agent` and `verifyAppSession` without defining them.
- **#15** VS Code Extension: `code --install-extension copilotkit.copilotkit` names an id not on the Marketplace (real: `copilotkit.copilotkit-vscode-extension`); "three sidebars" but two listed.
- **#16** Tool Rendering: `WeatherToolCard` reads `parameters.city`, the tool arg is `location` (empty heading); agent snippet uses undefined `SYSTEM_PROMPT`, `MODEL`, `chat_settings()`, `search_flights`, `get_stock_price`, `roll_d20`.
- **#17** MCP Apps: `agents: { default: agent }` uses an undefined `agent`; server URL is the `mcp.example.com` placeholder.
- **#20** Shared State: agent snippets use `MODEL`, `chat_settings`, `shared_state`, `RunContextWrapper`, `json` with no imports.
- **#21** State Streaming: `shared_state_streaming_agent` wrapped by `DocumentStreamingAgent` is never shown.
- **#22** Governed Actions: no agent shown; `handleApproval` calls `executeSideEffect`, never defined.
- **#23** All pages: `runtime-url="/api/copilotkit"` 404s on Vite (no proxy shown).
- **#24** Shared State / State Streaming: the OpenAI Agents streaming sample is introduced as "The sample below is the LangGraph (Python) version."; Sub-agents talks about "the Built-in Agent example" and "the LangGraph excerpt above".
- **#25** useInterrupt / Headless interrupts: the banner now says "Use `useHumanInTheLoop` on this framework", while the HITL Overview shows a `needs_approval=True` tool ending the run "with an interrupt for that call, which `useInterrupt` renders".

## Build-only
