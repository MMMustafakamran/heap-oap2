# Shared State

> Create a two-way connection between your UI and agent state.

## What is shared state?

Agentic Copilots maintain a shared state that seamlessly connects your UI with the agent's execution. This shared state system allows you to:

- Display the agent's current progress and intermediate results
- Update the agent's state through UI interactions
- React to state changes in real-time across your application

<ImageZoom
  src="https://cdn.copilotkit.ai/docs/copilotkit/images/coagents/SharedStateCoAgents.gif"
  alt="Shared State Demo"
  width={1000}
  height={1000}
  className="rounded-lg shadow-lg border mt-0"
/>

## When should I use this?

Use shared state when you want the agent and the user to collaborate through the same application state. The agent's outputs are reflected in the UI, and user updates in the UI are reflected in the agent's execution.

<OpsPlatformCTA
  variant="inline"
  title="Building stateful agents?"
  body="Persistent threads ship with CopilotKit Intelligence on the free Developer tier."
  surface="docs_shared_state"
/>

## Reading agent state

<Steps>
  <Step>
    ### Show the model the state in its instructions

    The page's state arrives with every run as `RunAgentInput.state`, and the
    adapter makes it the run's shared state. It does not reach the prompt by
    itself. Give the agent dynamic instructions that read it with the
    adapter's `shared_state()`, so the model sees the current value on every
    turn, including edits the user made with `agent.setState`:

    
~~~~python title="shared_state.py"
def with_state(prompt: str) -> Callable[[RunContextWrapper[Any], Agent[Any]], str]:
    """Dynamic instructions: ``prompt`` plus the run's shared state as JSON."""

    def instructions(_ctx: RunContextWrapper[Any], _agent: Agent[Any]) -> str:
        state = shared_state().value
        if not state:
            return prompt
        return (
            f"{prompt}\n\nCurrent shared application state (JSON; the user may "
            f"have edited it since your last turn):\n{json.dumps(state)}"
        )

    return instructions


~~~~


    
~~~~python title="shared_state.py"
READ_WRITE_PROMPT = (
    "You are a helpful, concise assistant. The shared application state below "
    "has a `preferences` object with the user's name, preferred tone, "
    "language and interests, which the user edits in the app: always respect "
    "them, and address the user by name when you know it. Its `notes` list "
    "holds what you have remembered so far. When the user asks you to "
    "remember something, or when you observe something worth surfacing in "
    "the UI, call `set_notes` with the FULL updated list of short note "
    "strings (existing notes + new)."
)


shared_state_read_write_agent = Agent(
    name="preferences_assistant",
    instructions=with_state(READ_WRITE_PROMPT),
    model=MODEL,
    model_settings=chat_settings(),
    tools=[set_notes],
)


~~~~


  </Step>
  <Step>
    ### Write state from a server tool

    Server tools are ordinary `@function_tool` functions. Inside one,
    `shared_state().update(...)` merges top-level keys into the state and
    streams a `STATE_SNAPSHOT` to the browser before the tool's own result, so
    any component subscribed with `useAgent` re-renders while the agent is
    still running.

    
~~~~python title="shared_state.py"
@function_tool
def set_notes(notes: list[str]) -> str:
    """Replace the notes array in shared state with the full updated list.

    Use this tool whenever the user asks you to "remember" something, or
    when you have an observation about the user worth surfacing in the
    UI's notes panel. Always pass the FULL notes list (existing notes +
    any new ones), not a diff. Keep each note short (< 120 chars).
    """
    shared_state().update(notes=notes)
    return "Notes updated."


~~~~


    `shared_state().set(value)` replaces the whole state instead. The
    request's own `state` is never changed.

  </Step>
</Steps>

<Callout type="info" title="Inside an OpenAIAgentsAgent run">
  `OpenAIAgentsAgent` sets up `shared_state()` for every request. If you
  drive the SDK yourself with the adapter's translator, start the run inside
  `use_shared_state(SharedState(run_input.state))` and pass the same object
  to `to_agui`.
</Callout>

Subscribe a component to the agent's state with `useAgent`. Any time the agent mutates its state, for example via a tool call, the composable updates its reactive `agent` ref and your UI re-renders with the new values.

```vue title="src/components/SharedWorkspace.vue"
<script setup lang="ts">
import { computed } from "vue";
import { useAgent, UseAgentUpdate } from "@copilotkit/vue/v2";

type WorkspaceState = {
  notes?: string[];
  preferences?: { tone?: string };
};

const { agent } = useAgent({
  agentId: "workspace",
  updates: [UseAgentUpdate.OnStateChanged],
});
const state = computed(
  () => (agent.value?.state ?? {}) as WorkspaceState,
);
</script>

<template>
  <ul>
    <li v-for="note in state.notes ?? []" :key="note">{{ note }}</li>
  </ul>
</template>
```

The returned `agent.value.state` is a plain object. Read it like any other reactive application data and render the parts you care about: agent-written notes, structured outputs, progress indicators, or anything else the agent has put there.

## Writing agent state

The same agent object exposes `setState`. Calling it from a UI event handler pushes the new value into shared state, and the agent reads it back on its next turn. The UI's writes visibly steer the model.

```vue title="src/components/SharedWorkspace.vue"
<script setup lang="ts">
function setTone(tone: string) {
  const current = agent.value;
  if (!current) return;

  const previous = (current.state ?? {}) as WorkspaceState;
  current.setState({
    ...previous,
    preferences: { ...previous.preferences, tone },
  });
}
</script>

<template>
  <button @click="setTone('concise')">Prefer concise answers</button>
</template>
```

This is what makes the channel two-way: the UI doesn't just observe the agent, it can hand the agent fresh inputs — preferences, selections, or partial work — without going through the chat thread.

## Rendering shared state in the UI

Because `agent.state` is plain data exposed through a Vue ref, the UI layer is ordinary Vue. The example above wires the agent's outputs into a list and feeds user edits back through `setState`.

Nothing about this is chat-specific: `useAgent` works in any component under `CopilotKitProvider`, so you can render agent state in your main view or canvas, not just inside the chat panel. See **[Render agent state in your app](/vue/openai-agents-python/vue/shared-state/rendering-in-app)** for the full main-view pattern.

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import SharedWorkspace from "./components/SharedWorkspace.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <SharedWorkspace />
    <CopilotChat agent-id="workspace" />
  </CopilotKitProvider>
</template>
```

## Streaming partial state updates

By default, agent state only updates *between* backend checkpoints, so a long-running tool call appears as one big burst at the end. State streaming forwards a specific tool argument straight into a state key *as it's being generated*, so the UI can watch the answer assemble token-by-token.

```python
# src/demo_agents/shared_state_streaming.py
def _document_so_far(arguments: str) -> str | None:
    """The ``document`` argument as far as the model has written it."""
    try:
        # Unfinished JSON: a string cut off mid-way is kept as it stands.
        value = from_json(arguments, allow_partial="trailing-strings")
    except ValueError:
        return None
    document = value.get("document") if isinstance(value, dict) else None
    return document if isinstance(document, str) else None


class DocumentStreamingAgent(OpenAIAgentsAgent):
    """Streams ``write_document``'s ``document`` argument into the state."""

    async def run_streamed(self, input: RunAgentInput) -> AsyncIterator[BaseEvent]:
        arguments: dict[str, str] = {}  # tool call id -> arguments so far
        async with aclosing(super().run_streamed(input)) as events:
            async for event in events:
                yield event
                if (
                    event.type == EventType.TOOL_CALL_START
                    and event.tool_call_name == write_document.name
                ):
                    arguments[event.tool_call_id] = ""
                elif (
                    event.type == EventType.TOOL_CALL_ARGS
                    and event.tool_call_id in arguments
                ):
                    arguments[event.tool_call_id] += event.delta
                    document = _document_so_far(arguments[event.tool_call_id])
                    if document is not None:
                        yield StateDeltaEvent(
                            type=EventType.STATE_DELTA,
                            delta=[
                                {"op": "add", "path": "/document", "value": document}
                            ],
                        )


```

See **[State streaming](/vue/openai-agents-python/vue/shared-state/streaming)** for the full walkthrough, including the corresponding `useAgent` subscription on the frontend.

## Read-only context

When a value is **UI-owned** and the agent should read it but never write it back, such as current user, selected record, or scroll position, reach for `useAgentContext` instead of full shared state. It publishes values as a one-way UI-to-agent channel that auto-unregisters on unmount.

`useAgentContext` is a separate read-only capability; it does not replace the bidirectional `agent.state` / `agent.setState(...)` contract above.

See **[Agent read-only context](/vue/openai-agents-python/vue/shared-state/agent-readonly)** for the full pattern.

<IntegrationGrid path="shared-state" exclude={["agno", "agent-spec", "spring-ai", "langroid"]} />
