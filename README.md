# OpenAIAgents-Vue

QA harness for the CopilotKit docs section https://docs.copilotkit.ai/vue/openai-agents-python (Vue 3 + Vite frontend, OpenAI Agents SDK Python backend). Each doc page is implemented verbatim (HARNESS-marked edits only), probed, and recorded as one clip. Open doc defects: [FINDINGS.md](FINDINGS.md). Page status: [assignment.json](assignment.json).

## Layout

- `my-copilot-app/` Vite app, one root per doc page (`src/App.vue` routes by path, `src/pages/<Page>App.vue`), runtime `server.openai.ts`, `doc-verbatim/` doc code that can't run in Vite (kept verbatim)
- `backend/` Python agents (`uv`): `main.py` quickstart agent (8131); page agents on 8132-8139
- `autorecorder/` recorder; `narration/` scripts + saved audio; `doc-snapshot/` docs baseline; `.qa/` shared tooling (synced, don't edit)

## Run

```sh
cp .env.example backend/.env   # fill in OPENAI_API_KEY
(cd backend && uv sync) && (cd my-copilot-app && npm install) && (cd autorecorder && npm ci)
bash start-all.sh               # 5130 Vite, 8130 runtime, 8131 quickstart agent
cd autorecorder && npx tsx ../.qa/tools/probe.mts --all
npm run record -- --pages=<id>
```
