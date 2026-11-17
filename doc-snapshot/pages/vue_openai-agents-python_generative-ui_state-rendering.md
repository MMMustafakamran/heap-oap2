# State Rendering

> Render your agent's state with custom UI components in real-time.

## What is this?

State rendering lets you build UI that reflects your agent's state in real-time. As your agent progresses through nodes and emits state updates, your frontend renders those changes, showing progress, drafts, or intermediate results.

<Callout type="info">
  **Free course:** See this pattern built end-to-end in [Build Interactive Agents with Generative UI](https://www.deeplearning.ai/short-courses/build-interactive-agents-with-generative-ui/) — a free DeepLearning.AI short course taught by CopilotKit's CEO covering the full Generative UI spectrum (Controlled, Declarative, and Open-Ended).
</Callout>

## When should I use this?

Use state rendering when you want to:

- Show real-time progress (e.g. "Researching... 2/5 complete")
- Display drafts that update as the agent works
- Build dashboards that reflect agent state
- Render structured output outside of the chat

## How it works in code

On the frontend, subscribe to the agent's state. Each time the backend forwards a fresh value, your component re-renders with the latest partial output. `useAgent` returns an `agent` ref; read `agent.value?.state` in script or let templates unwrap the ref. Keep the provider in an ancestor SFC.

```vue title="src/components/ResearchProgress.vue"
<script setup lang="ts">
import { computed } from "vue";
import { useAgent, UseAgentUpdate } from "@copilotkit/vue/v2";

type ResearchState = { status?: string; draft?: string; completed?: number; total?: number };

const { agent } = useAgent({
  agentId: "researcher",
  updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
});

const state = computed(() => (agent.value?.state ?? {}) as ResearchState);
</script>

<template>
  <section aria-live="polite">
    <p>{{ state.status ?? "Idle" }}</p>
    <progress :value="state.completed ?? 0" :max="state.total ?? 1" />
    <article v-if="state.draft">{{ state.draft }}</article>
  </section>
</template>
```

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import ResearchProgress from "./components/ResearchProgress.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <ResearchProgress />
    <CopilotChat agent-id="researcher" />
  </CopilotKitProvider>
</template>
```

On the backend, a state-streaming mapping forwards a specific tool argument straight into a state key *as it's being generated*. Some frameworks provide that as middleware; direct SDK adapters can emit `STATE_SNAPSHOT` events from their streaming loop. Either way, the UI can watch the answer assemble token-by-token rather than appearing in one burst between checkpoints.

The adapter streams a tool call's arguments as `TOOL_CALL_ARGS` events while
the model writes them, but it does not copy them into state. The tool writes
the finished value to state when it runs:


~~~~python title="shared_state_streaming.py"
@function_tool
def write_document(document: str) -> str:
    """Write a document for the user. Always call this tool when the user asks
    you to write, draft, or revise any text. The `document` argument is
    streamed into shared state under the `document` key so the UI renders
    the body live.
    """
    shared_state().update(document=document)
    return "Document written to shared state."


~~~~


To fill the state while the model is still writing the argument, subclass
`OpenAIAgentsAgent` and turn those argument chunks into `STATE_DELTA` events.
The arguments are unfinished JSON until the call ends, so parse them with
`pydantic_core.from_json(..., allow_partial="trailing-strings")`, which keeps
a string that is cut off mid-way:


~~~~python title="shared_state_streaming.py"
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


~~~~


Mount the agent wrapped in that subclass,
`DocumentStreamingAgent(shared_state_streaming_agent)`, instead of a plain
`OpenAIAgentsAgent`. The page then sees the document grow token by token, and
the tool's own `STATE_SNAPSHOT` settles it once the call runs.

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

Treat agent state as untrusted external data. Validate it before using it for privileged actions, and avoid putting secrets in state that is streamed to the browser.

<IntegrationGrid
  path="generative-ui/state-rendering"
  exclude={["agno", "agent-spec"]}
/>
