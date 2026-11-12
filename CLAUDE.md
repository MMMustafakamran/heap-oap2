# OpenAIAgents-Vue

Docs QA harness for CopilotKit + OpenAI Agents SDK (Python), Vue: https://docs.copilotkit.ai/vue/openai-agents-python. One route per doc page, doc code verbatim, one clip per page. The goal is to show doc defects; fixes that hide one are banned. Overview, layout and Run: [README.md](README.md).

## Rules

`.qa/` is the vendored copy of the shared tooling and rules (filled by the sync script; never edit it here).

@.qa/instructions/QA-RULES.md
@.qa/instructions/AUTORECORDER.md
@.qa/instructions/VOICE.md
@.qa/instructions/REVIEW.md
@.qa/instructions/REPORT.md

## This repo

- Ports (`start-all.sh`): Vite **5130**, runtime **8130** (`my-copilot-app/server.openai.ts`, one CopilotRuntime per path prefix: `/<page>/api/copilotkit`), quickstart agent **8131** (`backend/main.py`), page agents **8132-8139**. Never 3000 / 8000; the doc's 5173 / 8200 / 8000 are overridden.
- The rendered Vue quickstart has no Vue steps and no Python agent (FINDINGS.md #1, `quickstartBlocked`): the runtime registers `HttpAgent`s (as `default` + `openai_agent`) to agents served the way the React quickstart does (`OpenAIAgentsAgent` + `add_openai_agents_fastapi_endpoint`, path `/agent`). HARNESS evidence; the finding stands.
- Keys: `backend/.env` (`OPENAI_API_KEY`), `my-copilot-app/.env.intelligence` (`CPK_INTELLIGENCE_API_KEY`). Names in [.env.example](.env.example). Never print or commit them.
- `vite` dev doesn't type-check: `vue-tsc` / `vite build` errors are build-only findings.
- Recorder: `autorecorder/` (`npm run record -- --pages=<id>`, probe: `npx tsx ../.qa/tools/probe.mts <id>`). Quickstart in `actions/quickstart.actions.ts`; each page group gets its own `actions/<group>.actions.ts`.
