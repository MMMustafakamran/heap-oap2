import uuid

from ag_ui_openai_agents import shared_state
from agents import Agent, Runner, function_tool

from demo_agents._common import MODEL, chat_settings

SUPERVISOR_PROMPT = (
    "You are a supervisor. For research tasks call `research_agent`, for "
    "drafting call `writing_agent`, for review call `critique_agent`. "
    "Delegate step by step: research first, then write, then critique once, "
    "then answer the user with the final draft."
)

SUB_AGENTS = {
    "research_agent": Agent(
        name="research_agent",
        model=MODEL,
        model_settings=chat_settings(),
        instructions=(
            "You are a research sub-agent. Given a topic, produce a concise "
            "bulleted list of 3-5 key facts. No preamble, no closing."
        ),
    ),
    "writing_agent": Agent(
        name="writing_agent",
        model=MODEL,
        model_settings=chat_settings(),
        instructions=(
            "You are a writing sub-agent. Given a brief and optional source "
            "facts, produce a polished 1-paragraph draft. Be clear and "
            "concrete. No preamble."
        ),
    ),
    "critique_agent": Agent(
        name="critique_agent",
        model=MODEL,
        model_settings=chat_settings(),
        instructions=(
            "You are an editorial critique sub-agent. Given a draft, give 2-3 "
            "crisp, actionable critiques. No preamble."
        ),
    ),
}

SUB_AGENT_EMPTY_SENTINEL = "<sub-agent produced no output>"


async def _delegate(role: str, task: str) -> str:
    result = await Runner.run(SUB_AGENTS[role], task)
    output = str(result.final_output or "").strip() or SUB_AGENT_EMPTY_SENTINEL
    # Read and write with no await in between, so delegations the model makes
    # in parallel cannot drop each other's entry.
    state = shared_state()
    delegations = list(state.value.get("delegations") or [])
    delegations.append(
        {
            "id": str(uuid.uuid4()),
            "sub_agent": role,
            "task": task,
            "status": "completed",
            "result": output,
        }
    )
    state.update(delegations=delegations)
    return output


@function_tool
async def research_agent(task: str) -> str:
    """Delegate a research task; returns 3-5 key facts."""
    return await _delegate("research_agent", task)


@function_tool
async def writing_agent(task: str) -> str:
    """Delegate a drafting task; returns a one-paragraph draft."""
    return await _delegate("writing_agent", task)


@function_tool
async def critique_agent(task: str) -> str:
    """Delegate a review task; returns 2-3 critiques."""
    return await _delegate("critique_agent", task)




subagents_agent = Agent(
    name="supervisor",
    instructions=SUPERVISOR_PROMPT,
    model=MODEL,
    # Research, then write, then critique: one delegation per model call.
    model_settings=chat_settings(parallel_tool_calls=False),
    tools=[research_agent, writing_agent, critique_agent],
)
