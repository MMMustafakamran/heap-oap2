# FINDINGS — OpenAIAgents-Vue

Open doc defects found implementing https://docs.copilotkit.ai/vue/openai-agents-python (Vue frontend + OpenAI Agents SDK Python backend).
Stack: @copilotkit/vue 1.85.0, @copilotkit/runtime 1.85.0 (declared ^1.85.0), @ag-ui/client 1.0.4, vue 3.5.45, vite 8.3.6; openai-agents 0.24.0, ag-ui-openai-agents 0.1.0, fastapi 0.162.5, uvicorn 0.54.0; Python 3.13.15, Node 26.7.0, npm 12.0.2; Microsoft Windows 11 Pro. Docs: https://docs.copilotkit.ai/vue/openai-agents-python (snapshot 2026-11-13).

## Dev blockers

### [Quickstart](https://docs.copilotkit.ai/vue/openai-agents-python)
**#1 The Vue quickstart has no Vue steps and no Python agent.**
- **Doc:** the sidebar's Quickstart renders the landing page ("Bring your OpenAI Agents SDK agents into any app", a "Start building" setup-prompt wizard). Its only code ("Connect your agent") is a Next.js route handler: `import type { NextRequest } from "next/server";` ... `export const POST = (req: NextRequest) => handler(req);`. No `@copilotkit/vue` install, no Node runtime for Vite, no `Agent` / `ag_ui_openai_agents` code. "Read the setup guide" (`/vue/openai-agents-python/quickstart`) lands back on the same landing page. The `.md` export instead shows the generic Vue quickstart, which registers `BuiltInAgent` and says to "use your framework's quickstart for the runtime wiring".
- **Result:** a reader can't get a Vue app talking to an OpenAI Agents SDK agent from the Vue docs. **Confirmed by harness:** `my-copilot-app/server.openai.ts` (the `.md` export's `createCopilotNodeListener` server with the landing page's `HttpAgent`) + the React quickstart's `main.py` (`OpenAIAgentsAgent` + `add_openai_agents_fastapi_endpoint`) replies normally.

## Minor notes

## Build-only
