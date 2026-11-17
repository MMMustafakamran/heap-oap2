# HARNESS: none of the "interact" pages (Shared State, State Streaming, HITL, Sub-Agents) shows how to serve its agent.
# Served like the React quickstart's main.py (OpenAIAgentsAgent + add_openai_agents_fastapi_endpoint), one path per page.
# start-all.sh: (cd backend && uv run --env-file .env uvicorn app:app --app-dir interact --port 8136)
from ag_ui_openai_agents import OpenAIAgentsAgent, add_openai_agents_fastapi_endpoint
from fastapi import FastAPI

from hitl import hitl_in_chat_agent
from shared_state import shared_state_read_write_agent
from shared_state_streaming import DocumentStreamingAgent, shared_state_streaming_agent
from subagents import subagents_agent

app = FastAPI()
add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(shared_state_read_write_agent), "/shared-state")
# The page: "Mount the agent wrapped in that subclass, DocumentStreamingAgent(shared_state_streaming_agent)"
add_openai_agents_fastapi_endpoint(app, DocumentStreamingAgent(shared_state_streaming_agent), "/shared-state-streaming")
add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(hitl_in_chat_agent), "/hitl")
add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(subagents_agent), "/subagents")
