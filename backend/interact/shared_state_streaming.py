# State Streaming page (docs.copilotkit.ai/vue/openai-agents-python/shared-state/streaming), snippets verbatim.
# HARNESS: imports are never shown on the page
from contextlib import aclosing
from typing import AsyncIterator

from ag_ui.core import BaseEvent, EventType, RunAgentInput, StateDeltaEvent
from ag_ui_openai_agents import OpenAIAgentsAgent, shared_state
from agents import Agent, function_tool
from pydantic_core import from_json

from demo_agents._common import MODEL, chat_settings


@function_tool
def write_document(document: str) -> str:
    """Write a document for the user. Always call this tool when the user asks
    you to write, draft, or revise any text. The `document` argument is
    streamed into shared state under the `document` key so the UI renders
    the body live.
    """
    shared_state().update(document=document)
    return "Document written to shared state."


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


# HARNESS: the page mounts `DocumentStreamingAgent(shared_state_streaming_agent)` but never shows that agent
shared_state_streaming_agent = Agent(
    name="writer",
    instructions="You are a writing assistant. When asked to write anything, call `write_document`.",
    model=MODEL,
    model_settings=chat_settings(),
    tools=[write_document],
)
