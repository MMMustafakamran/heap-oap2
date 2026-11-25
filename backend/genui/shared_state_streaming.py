# State Rendering page (docs.copilotkit.ai/vue/openai-agents-python/generative-ui/state-rendering).
# The page shows write_document, _document_so_far and DocumentStreamingAgent. ADDED: the imports and
# the agent the page wraps (`shared_state_streaming_agent`) are never shown.
from collections.abc import AsyncIterator  # ADDED: imports never shown on the page
from contextlib import aclosing

from ag_ui.core import BaseEvent, EventType, RunAgentInput, StateDeltaEvent
from ag_ui_openai_agents import OpenAIAgentsAgent, shared_state
from agents import Agent, function_tool
from pydantic_core import from_json


# --- doc, verbatim ---
@function_tool
def write_document(document: str) -> str:
    """Write a document for the user. Always call this tool when the user asks
    you to write, draft, or revise any text. The `document` argument is
    streamed into shared state under the `document` key so the UI renders
    the body live.
    """
    shared_state().update(document=document)
    return "Document written to shared state."


# ADDED: the page wraps `shared_state_streaming_agent` but never shows it.
shared_state_streaming_agent = Agent(
    name="writer",
    instructions="You write documents. Always use the write_document tool for any text the user asks for.",
    tools=[write_document],
)


# --- doc, verbatim ---
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
