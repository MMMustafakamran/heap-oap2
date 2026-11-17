# HARNESS: genui page agents on 8134 (start-all.sh): one FastAPI app, one path per page.
#   /tool-rendering   tool_rendering.py (page fragments + HARNESS fill-ins)
#   /state-rendering  shared_state_streaming.py (DocumentStreamingAgent, as the page says to mount it)
#   /reasoning        HARNESS reasoning-model agent (the Reasoning page shows no agent at all)
#   /a2ui-fixed       demo_agents/a2ui_fixed.py (A2UI Fixed Schema page, verbatim)
from ag_ui_openai_agents import OpenAIAgentsAgent, add_openai_agents_fastapi_endpoint
from agents import Agent, ModelSettings
from fastapi import FastAPI
from openai.types.shared import Reasoning

from shared_state_streaming import DocumentStreamingAgent, shared_state_streaming_agent
from tool_rendering import tool_rendering_agent

app = FastAPI()
add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(tool_rendering_agent), "/tool-rendering")
# doc: "Mount the agent wrapped in that subclass, DocumentStreamingAgent(shared_state_streaming_agent)"
add_openai_agents_fastapi_endpoint(app, DocumentStreamingAgent(shared_state_streaming_agent), "/state-rendering")

# HARNESS: Reasoning page shows no agent; a reasoning model with summaries on, to see if the adapter forwards them.
reasoning_agent = Agent(
    name="assistant",
    instructions="You are a helpful assistant embedded in a CopilotKit app.",
    model="gpt-5-mini",
    model_settings=ModelSettings(reasoning=Reasoning(effort="medium", summary="auto")),
)
add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(reasoning_agent), "/reasoning")

# A2UI Fixed Schema: the page's a2ui_fixed.py agent (runtime agent id "a2ui-fixed-schema").
from demo_agents.a2ui_fixed import a2ui_fixed_agent  # noqa: E402

add_openai_agents_fastapi_endpoint(app, OpenAIAgentsAgent(a2ui_fixed_agent), "/a2ui-fixed")
