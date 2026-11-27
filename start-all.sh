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
# CHANGED: every server runs in a real terminal (.qa/tools/ptyrun.cjs): logs/<name>.log as before,
# plus logs/<name>.log.pty, the raw terminal the recorder shows on a failed take.
PTYRUN="node $(pwd)/.qa/tools/ptyrun.cjs"

(cd backend && $PTYRUN ../logs/backend-8131.log --name "uv run uvicorn main:app --port 8131" -- uv run --env-file .env uvicorn main:app --port 8131) &
(cd backend && $PTYRUN ../logs/backend-8136.log --name "uv run uvicorn app:app --app-dir interact --port 8136" -- uv run --env-file .env uvicorn app:app --app-dir interact --port 8136) &  # interact pages: shared-state, streaming, hitl, subagents
(cd backend && $PTYRUN ../logs/backend-8134.log --name "uv run uvicorn app:app --app-dir genui --port 8134" -- uv run --env-file .env uvicorn app:app --app-dir genui --port 8134) &  # genui pages: tool-rendering, state-rendering
(cd backend && $PTYRUN ../logs/backend-8132.log --name "uv run uvicorn pages_chat:app --port 8132" -- uv run --env-file .env uvicorn pages_chat:app --port 8132) &  # chat pages
# (cd backend && uv run --env-file .env uvicorn <module>:app --port 8132 > ../logs/backend-8132.log 2>&1) &

cd my-copilot-app
(PORT=8130 $PTYRUN ../logs/runtime-8130.log --name "npx tsx server.openai.ts" -- npx tsx server.openai.ts) &
($PTYRUN ../logs/vite-5130.log --name "npm run dev" -- npm run dev) &
# HARNESS: Vue quickstart: its own server.ts verbatim (BuiltInAgent), port 8200 -> 8135 via the doc's PORT override
(PORT=8135 $PTYRUN ../logs/runtime-8135.log --name "npx tsx server.ts" -- npx tsx --env-file=../backend/.env server.ts) &
wait
