#!/usr/bin/env bash
# HARNESS: starts every OpenAIAgents-Vue server on its harness port (QA-RULES §4: never 3000/8000).
#   8131 agent for the guide pages (backend/main.py, React quickstart's main.py; the Vue quickstart shows none, FINDINGS.md #1)
#   8132-8139 page agents (add one line per page group below)
#   8130 runtime (my-copilot-app/server.openai.ts; doc: 8200), one runtime per path prefix
#   8135 the Vue quickstart's own server.ts (BuiltInAgent; doc: 8200), used by the quickstart route only
#   5130 Vite (doc: 5173)
# Keys: backend/.env (OPENAI_API_KEY), my-copilot-app/.env.intelligence (CPK key, Intelligence pages). Names in .env.example.
cd "$(dirname "$0")"
mkdir -p logs

(cd backend && uv run --env-file .env uvicorn main:app --port 8131 > ../logs/backend-8131.log 2>&1) &
(cd backend && uv run --env-file .env uvicorn app:app --app-dir interact --port 8136 > ../logs/backend-8136.log 2>&1) &  # interact pages: shared-state, streaming, hitl, subagents
(cd backend && uv run --env-file .env uvicorn app:app --app-dir genui --port 8134 > ../logs/backend-8134.log 2>&1) &  # genui pages: tool-rendering, state-rendering
(cd backend && uv run --env-file .env uvicorn pages_chat:app --port 8132 > ../logs/backend-8132.log 2>&1) &  # chat pages
# (cd backend && uv run --env-file .env uvicorn <module>:app --port 8132 > ../logs/backend-8132.log 2>&1) &

cd my-copilot-app
(PORT=8130 npx tsx server.openai.ts > ../logs/runtime-8130.log 2>&1) &
(npm run dev > ../logs/vite-5130.log 2>&1) &
# HARNESS: Vue quickstart: its own server.ts verbatim (BuiltInAgent), port 8200 -> 8135 via the doc's PORT override
(PORT=8135 npx tsx --env-file=../backend/.env server.ts > ../logs/runtime-8135.log 2>&1) &
wait
