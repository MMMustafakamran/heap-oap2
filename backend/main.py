# HARNESS: the Vue quickstart shows no Python agent (the rendered page is the OpenAI Agents SDK landing page,
# FINDINGS.md #1). This is main.py from the React quickstart (docs.copilotkit.ai/openai-agents-python/quickstart),
# verbatim, used as the agent for Vue pages that show no backend of their own. Served on 8131 (QA-RULES §4),
# start-all.sh: uv run --env-file .env uvicorn main:app --port 8131
from agents import Agent
from ag_ui_openai_agents import (
    OpenAIAgentsAgent,
    add_openai_agents_fastapi_endpoint,
)
from fastapi import FastAPI

agent = OpenAIAgentsAgent(
    Agent(
        name="assistant",
        instructions="You are a helpful assistant embedded in a CopilotKit app.",
    )
)

app = FastAPI()
add_openai_agents_fastapi_endpoint(app, agent, "/agent")
