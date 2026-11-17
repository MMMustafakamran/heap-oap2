# Sub-Agents

> Decompose work across multiple specialized agents with a visible delegation log.


<!-- interactive demo: subagents -->


## What is this?

Sub-agents are the canonical multi-agent pattern: a top-level
**supervisor** LLM orchestrates one or more specialized **sub-agents**
by exposing each of them as a tool. The supervisor decides what to
delegate, the sub-agents do their narrow job, and their results flow
back up to the supervisor's next step.

This is fundamentally the same shape as tool-calling, but each "tool"
is itself a full-blown agent with its own system prompt and (often) its
own tools, memory, and model.

## When should I use this?

Reach for sub-agents when a task has distinct specialized sub-tasks
that each benefit from their own focus:

- **Research → Write → Critique** pipelines, where each stage needs a
  different system prompt and temperature.
- **Router + specialists**, where one agent classifies the request and
  dispatches to the right expert.
- **Divide-and-conquer** — any problem that fits cleanly into parallel
  or sequential sub-problems.

The example below uses the Research → Write → Critique shape as the
canonical example.

## Setting up sub-agents

<Steps>
  <Step>
    ### Install the OpenAI Agents AG-UI adapter

    ```bash
    pip install ag-ui-openai-agents openai-agents
    ```

  </Step>
  <Step>
    ### Give the supervisor one tool per sub-agent

    Each sub-agent is its own SDK `Agent` with a role prompt. The supervisor
    reaches it through an `async` function tool that runs the sub-agent with
    `Runner.run` and returns its final output. The supervisor's instructions
    decide the order. Every delegation is an ordinary tool call, so the
    adapter streams the `TOOL_CALL_*` events the UI renders its
    per-delegation cards from.

    
~~~~python title="subagents.py"
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


~~~~


    Each delegation also appends an entry to the `delegations` slot of shared
    state with `shared_state().update(...)`, which streams a `STATE_SNAPSHOT`
    as the tool finishes, so the UI's delegation log fills in while the
    supervisor is still running.

  </Step>
</Steps>

<Callout type="info" title="Handoffs and agents as tools">
  The SDK's other multi-agent tools work through the adapter too, with two
  limits. An agent reached by `handoffs` keeps its own tools and
  instructions, so it does not get the page's frontend tools or the
  `useAgentContext` entries. Give it what it needs through its own dynamic
  instructions, for example by reading `shared_state()`. A tool marked
  `needs_approval=True` inside an agent used through `Agent.as_tool()` cannot
  be resumed, because it pauses inside the sub-agent's own run. Gate the
  agent tool itself (`as_tool(..., needs_approval=True)`) or reach the
  sub-agent by handoff.
</Callout>

Each sub-agent is an isolated agent call with its own model, system
prompt, and optional tools. They don't share memory or tools with the
supervisor; the supervisor only ever sees what the sub-agent returns.

```python
# src/demo_agents/subagents.py
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


```

Keep sub-agent system prompts narrow and focused. The point of this pattern
is that each one does one thing well. If a sub-agent needs to know
the whole user context to do its job, that's a signal the boundary is
wrong.

## Exposing sub-agents as tools

The supervisor delegates by calling tools. Each delegation tool is a thin
wrapper around a specialized agent call that:

1. Runs the sub-agent on the supplied `task` string.
2. Records the delegation into a `delegations` slot in shared agent
   state (so the UI can render a live log).
3. Returns the sub-agent's final message as the tool result, which the
   supervisor sees on its next turn.

```python
# src/demo_agents/subagents.py
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


```

This is where CopilotKit's shared-state channel earns its keep: the
supervisor's tool calls mutate `delegations` as they happen, and the
frontend renders every new entry live.

<Callout type="warn">
  Give every delegation a stable `id` and merge new entries by that `id`. The
  client sends its copy of shared state back as run input on every run, so a
  slot that blindly appends whatever it receives — a LangGraph
  `Annotated[list, operator.add]` reducer, for example — concatenates the
  entries the client just echoed onto the ones the agent already has, and the
  log doubles when a thread is continued.
</Callout>

## Rendering a live delegation log

On the frontend, the delegation log is a reactive render of the
`delegations` slot.





The result: as the supervisor fans work out to its sub-agents, the log
grows in real time, giving the user visibility into a process that
would otherwise be a long opaque spinner.

## Related

- **[Shared State](/vue/openai-agents-python/shared-state)** — the channel that makes the
  delegation log live.
- **[State streaming](/vue/openai-agents-python/shared-state/streaming)** — stream
  *individual* sub-agent outputs token-by-token inside each log entry.
