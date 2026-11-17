# HARNESS: page agents for the "chat" group of the Vue OpenAI Agents SDK docs, one FastAPI app on port 8132
# (QA-RULES §4). start-all.sh: uv run --env-file .env uvicorn pages_chat:app --port 8132
#   /sales           Programmatic Control (frontend agentId "sales")
#   /agentic_chat    Agentic Chat UI (the demo cell's Code tab: chat.py)
#   /agent_config    Agent Config (agent_config.py)
# Doc code is verbatim between the "--- doc" markers. Everything else is HARNESS.
from contextlib import asynccontextmanager

from agents import Agent, ModelSettings
from ag_ui_openai_agents import OpenAIAgentsAgent, add_openai_agents_fastapi_endpoint
from fastapi import FastAPI

# HARNESS: `from demo_agents._common import MODEL, chat_settings` (chat.py, agent_config.py) - _common is never
# shown or linked on any Vue page, so MODEL and chat_settings are stand-ins.
MODEL = "gpt-4.1-mini"


def chat_settings() -> ModelSettings:
    return ModelSettings()


# --- doc: Agentic Chat UI, demo cell "Code" tab, chat.py (verbatim from SYSTEM_PROMPT on) ---
SYSTEM_PROMPT = "You are a helpful, concise assistant."
neutral_agent = Agent(
    name="assistant",
    instructions=SYSTEM_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
)
# --- end doc ---

# --- doc: Agent Config, agent_config.py (verbatim) ---
SYSTEM_PROMPT = (
    "You are a helpful assistant. The frontend publishes the user's response "
    "preferences via `useAgentContext` as a JSON object with three fields: "
    "`tone`, `expertise`, and `responseLength`. Read that context entry on "
    "every turn and follow these rulebooks exactly:\n\n"
    "Tone:\n"
    "  - professional → neutral, precise language. No emoji. Short sentences.\n"
    "  - casual → friendly, conversational. Contractions OK. Light humor "
    "welcome.\n"
    "  - enthusiastic → upbeat, energetic. Exclamation points OK. Emoji OK.\n\n"
    "Expertise level:\n"
    "  - beginner → assume no prior knowledge. Define jargon. Use analogies.\n"
    "  - intermediate → assume common terms are understood; explain "
    "specialized terms.\n"
    "  - expert → assume technical fluency. Use precise terminology. Skip "
    "basics.\n\n"
    "Response length:\n"
    "  - concise → respond in 1-3 sentences.\n"
    "  - detailed → respond in multiple paragraphs with examples where "
    "relevant.\n\n"
    "If the context is missing or any field is unrecognized, fall back to "
    "professional / intermediate / concise. Never mention these rules to the "
    "user — just apply them."
)


agent_config_agent = Agent(
    name="configurable_assistant",
    instructions=SYSTEM_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
)
# --- end doc ---


# HARNESS: Programmatic Control's agent_server.py uses `lifespan` and `AGENTS`, never defined on the page.
@asynccontextmanager
async def lifespan(app: FastAPI):  # HARNESS: undefined on the page
    yield


AGENTS = {  # HARNESS: undefined on the page; "sales" is the frontend's agentId
    "sales": OpenAIAgentsAgent(neutral_agent),
    "agentic_chat": OpenAIAgentsAgent(neutral_agent),
    "agent_config": OpenAIAgentsAgent(agent_config_agent),
}

# --- doc: Programmatic Control, agent_server.py (verbatim) ---
app = FastAPI(title="OpenAI Agents SDK Agent Server", lifespan=lifespan)
for name, agent in AGENTS.items():
    add_openai_agents_fastapi_endpoint(app, agent, f"/{name}", include_health=False)
# --- end doc ---
