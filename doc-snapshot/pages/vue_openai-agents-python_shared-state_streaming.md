# State Streaming

> Stream partial agent state updates to the UI while a tool call is still running.

## What is this? [#what-is-this]

By default, agent state only updates *between* backend checkpoints, so a long-running tool call, such as writing a full document or drafting an email, appears to the UI as one big burst at the end. For agent-native apps, that feels broken: users expect to watch the output materialize.

**State streaming** copies the value of one tool argument into an agent state key while the model writes it. The UI, subscribed through `useAgent`, re-renders every token.

## When should I use this? [#when-should-i-use-this]

Use state streaming whenever a tool's output is long-form text or a growing structured value and you want the user to see it assemble in real time. Common shapes:

- A collaborative writing agent that emits a document
- A research agent that accumulates a list of findings
- A planning agent that builds up a step-by-step plan

Without streaming, the user stares at a spinner. With streaming, they see the answer grow token-by-token.

## The backend: one streaming state mapping [#the-backend-one-streaming-state-mapping]

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

The backend pattern is always the same: map one streaming tool argument to one shared-state key. Middleware-backed frameworks usually expose this as a declarative mapping. Direct SDK adapters do the same work in their streaming loop by parsing partial tool arguments and emitting `STATE_SNAPSHOT` whenever the mapped value changes. When the LLM streams that argument, CopilotKit writes every partial value into shared state before the tool finishes executing. The sample below is the LangGraph (Python) version.

```python title="src/demo_agents/shared_state_streaming.py"
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

A few things to note:

- The state key must exist in your agent state (`document` in this example).
- The tool and argument names must match the exact LLM-facing tool call you want to forward.
- When the tool call completes, its final return value is written to the same key, so the streamed partial eventually becomes the authoritative final value.

## The frontend: useAgent + OnStateChanged [#the-frontend-useagent--onstatechanged]

The UI side is identical to any other [shared-state](/vue/shared-state) subscription: `useAgent` with `OnStateChanged` gives you a reactive `agent.value.state`. Add `OnRunStatusChanged` if you want a live/done indicator.

```vue title="src/components/StreamingDocument.vue"
<script setup lang="ts">
import { computed } from "vue";
import { useAgent, UseAgentUpdate } from "@copilotkit/vue/v2";

type DocumentState = { document?: string };

const { agent } = useAgent({
  agentId: "writer",
  updates: [
    UseAgentUpdate.OnStateChanged,
    UseAgentUpdate.OnRunStatusChanged,
  ],
});
const state = computed(
  () => (agent.value?.state ?? {}) as DocumentState,
);
</script>

<template>
  <article aria-live="polite">
    <span v-if="agent?.isRunning">LIVE</span>
    <p>{{ state.document ?? "Waiting for a draft…" }}</p>
  </article>
</template>
```

From there, `state.document` is a string that grows on every token, and `agent.isRunning` tells you whether to show a streaming indicator.

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import StreamingDocument from "./components/StreamingDocument.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <StreamingDocument />
    <CopilotChat agent-id="writer" />
  </CopilotKitProvider>
</template>
```

Ask the writer agent to draft a short document. The LIVE badge shows, and the text grows while the agent writes.

If the runtime does not emit partial state snapshots, the UI sees only the final state. The Vue frontend cannot invent updates the backend never sends.

<IntegrationGrid path="shared-state/streaming" exclude={["agno", "agent-spec", "spring-ai", "langroid"]} />
