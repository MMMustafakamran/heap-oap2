#!/usr/bin/env bash
# HARNESS: starts every OpenAIAgents-Vue server on its harness port (QA-RULES §4: never 3000/8000).
#   8131 quickstart agent (backend/main.py, React quickstart's main.py; the Vue quickstart shows none, FINDINGS.md #1)
#   8132-8139 page agents (add one line per page group below)
#   8130 runtime (my-copilot-app/server.openai.ts; doc: 8200), one runtime per path prefix
#   5130 Vite (doc: 5173)
# Keys: backend/.env (OPENAI_API_KEY), my-copilot-app/.env.intelligence (CPK key, Intelligence pages). Names in .env.example.
cd "$(dirname "$0")"
mkdir -p logs

(cd backend && uv run --env-file .env uvicorn main:app --port 8131 > ../logs/backend-8131.log 2>&1) &
# (cd backend && uv run --env-file .env uvicorn <module>:app --port 8132 > ../logs/backend-8132.log 2>&1) &

cd my-copilot-app
(PORT=8130 npx tsx server.openai.ts > ../logs/runtime-8130.log 2>&1) &
(npm run dev > ../logs/vite-5130.log 2>&1) &
wait
