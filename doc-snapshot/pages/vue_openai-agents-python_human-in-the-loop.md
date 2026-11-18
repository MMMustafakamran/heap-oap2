# HITL Overview

> Allow your agent and users to collaborate on complex tasks.

## What is this? [#what-is-this]

Human-in-the-loop (HITL) lets an agent pause mid-run to collect input, confirmation, or a choice from the user, then resume with that answer folded back into its reasoning. It's what turns an autonomous workflow into a collaborative one: the agent keeps its context, the user keeps the steering wheel.

<video
  src="https://cdn.copilotkit.ai/docs/copilotkit/images/coagents/human-in-the-loop-example.mp4"
  className="rounded-lg shadow-xl"
  loop
  playsInline
  controls
  autoPlay
  muted
/>

## When should I use this? [#when-should-i-use-this]

Use HITL when you need:

- **Quality control**: a human gate at high-stakes decision points.
- **Missing information**: the agent asks the user for a value it cannot find.
- **Expert input**: the user supplies domain knowledge the model lacks.

## Two patterns for HITL in CopilotKit [#two-patterns-for-hitl-in-copilotkit]

<Steps>
  <Step>
    ### Install the OpenAI Agents AG-UI adapter

    ```bash
    pip install ag-ui-openai-agents openai-agents
    ```

  </Step>
  <Step>
    ### Ask for the human with a frontend tool

    The simplest route is an ordinary frontend tool. Register it in the
    browser with `useHumanInTheLoop`, or with `useFrontendTool` and an `async`
    handler that resolves once the user has answered. The adapter hands the
    tool to the model on every run. When the model calls it, the run stops and
    the browser asks the user. The answer goes back with the next request as
    the call's result, and the model continues from there. Nothing waits on
    the server in between.

  </Step>
  <Step>
    ### Name the tool in the agent's instructions

    That leaves the agent with one job: knowing the tool exists and when to
    call it. A model that is never told about `book_call` will answer in prose
    and the picker will never mount.

~~~~python title="hitl.py"
from agents import Agent

from demo_agents._common import MODEL, chat_settings

HITL_IN_CHAT_PROMPT = (
    "You help users book an onboarding call with the sales team. "
    "When they ask to book a call, call the frontend-provided "
    "`book_call` tool with a short topic and the user's name. "
    "Keep any chat reply to one short sentence."
)


hitl_in_chat_agent = Agent(
    name="booking_assistant",
    instructions=HITL_IN_CHAT_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
)


~~~~

  </Step>
  <Step>
    ### Or gate a server tool with `needs_approval`

    When the backend decides it needs the user, mark the tool
    `needs_approval=True`. The SDK pauses before the tool runs, and the
    adapter ends the AG-UI run with an interrupt for that call, which
    `useInterrupt` renders. The interrupt's `reason` is `"tool_approval"`,
    its `metadata` carries `tool_name` and the parsed `tool_input`, and it
    asks for `{"approved": boolean}`.

~~~~python title="interrupt_agent.py"
@function_tool(needs_approval=True)
def schedule_meeting(ctx: ToolContext[Any], topic: str, attendee: str = "") -> str:
    """Ask the user to pick a meeting time, then confirm what was scheduled.

    Args:
        topic: Short description of the meeting purpose.
        attendee: Who the meeting is with, if known.
    """
    # Runs once the user approved, with the time they picked beside it.
    answer = _answers.get({}).get(ctx.tool_call_id, {})
    label = answer.get("chosen_label") or answer.get("chosen_time")
    if not label:
        return f"User did not pick a time. Meeting NOT scheduled: {topic}"
    return f"Meeting scheduled for {label}: {topic}"


~~~~

    The next request resumes the interrupt. `{"approved": true}` runs the
    tool before the model is called again. Any other answer gives the model
    the SDK's rejection text, and a cancelled interrupt answers the call as
    cancelled. If the user sends a new message instead of deciding, the
    approval stays open: the run ends with the same interrupt again, and the
    new message reaches the model once the approval is decided.

  </Step>
  <Step>
    ### Hand the tool more than a yes or no

    An Agents SDK approval is only a yes or a no, so an approved tool runs
    with its own arguments and nothing else. The showcase's picker sends the
    chosen time beside `approved`. A small `OpenAIAgentsAgent` subclass keeps
    each request's answers, by tool call id, where `schedule_meeting` can
    read them:

~~~~python title="interrupt_agent.py"
class SchedulerAgent(OpenAIAgentsAgent):
    """Lets ``schedule_meeting`` read the time the user picked.

    The adapter runs an approved call with its arguments alone: an Agents SDK
    approval is a yes or a no, with nothing to hand the tool. The picker
    sends the time beside the approval, so this keeps each answer where the
    tool can read it.
    """

    async def run_streamed(self, input: RunAgentInput) -> AsyncIterator[BaseEvent]:
        _answers.set(
            {
                entry.interrupt_id: entry.payload
                for entry in input.resume or []
                if isinstance(entry.payload, dict)
            }
        )
        async with aclosing(super().run_streamed(input)) as events:
            async for event in events:
                yield event


~~~~

  </Step>
</Steps>

<Callout type="warn" title="Nothing is kept on the server">
  The paused call lives in the conversation the page holds, and the server
  trusts the history it is sent. Replaying the same resume request runs an
  approved tool again, so key side effects on `ToolContext.tool_call_id`
  where a retry must not repeat them, and authorize the decision yourself if
  that matters.
</Callout>

CopilotKit ships two complementary ways to pause an agent turn and ask the human something. They look similar from the outside (the chat pauses, a custom component appears, the user answers, the run resumes), but they're wired differently on the backend, and each has its own niche.

| Pattern | Who decides to pause? | Backend surface |
| --- | --- | --- |
| `useHumanInTheLoop` | The **LLM**, by calling a registered client-side tool | A frontend-only tool description (Zod schema + `render`) |
| `useInterrupt` | Your **agent code**, at a step that must stop for a person | An interrupt the agent emits, for example `interrupt()` in a LangGraph node |

**Pick `useHumanInTheLoop`** when the pause is an _agent-initiated_ decision (the model chose to ask the user) and you want the picker UI inlined into the normal tool-call flow.

**Pick `useInterrupt`** when the pause is a checkpoint in your agent code: the code path always requires a human answer, and the server-side contract is an interrupt. On the Built-in Agent, interrupts are temporarily unavailable, so use `useHumanInTheLoop` there.

## Pattern 1: `useHumanInTheLoop` (tool-based) [#pattern-1-usehumanintheloop-tool-based]

The app registers a HITL tool on the client with `useHumanInTheLoop`. When the LLM calls that tool, CopilotKit renders your Vue component and gives it a `respond` callback during the executing phase. The agent sees the answer as the tool result and continues from there.

```vue title="src/components/MeetingApproval.vue"
<script setup lang="ts">
import { z } from "zod";
import { useHumanInTheLoop } from "@copilotkit/vue/v2";
import TimePickerCard from "./TimePickerCard.vue";

useHumanInTheLoop({
  name: "schedule_meeting",
  description: "Ask the user to select a meeting time.",
  parameters: z.object({
    topic: z.string(),
    attendee: z.string(),
  }),
  render: TimePickerCard,
});
</script>

<template><p>Meeting approval tool registered.</p></template>
```

`TimePickerCard.vue` receives the tool arguments and a `respond` callback. `respond` is defined only while the tool call is executing:

```vue title="src/components/TimePickerCard.vue"
<script setup lang="ts">
const props = defineProps<{
  args: { topic?: string; attendee?: string };
  respond?: (result: unknown) => Promise<void>;
}>();
</script>

<template>
  <section>
    <p>Pick a time for {{ props.args.topic ?? "the meeting" }}</p>
    <button
      :disabled="!props.respond"
      @click="props.respond?.({ chosen_time: '09:00' })"
    >
      Tomorrow at 09:00
    </button>
  </section>
</template>
```

The picker UI can use static candidate slots, live availability, a calendar API, or any other application data. Mount the registration component beneath `CopilotKitProvider` so the composable can reach the runtime.

## Pattern 2: `useInterrupt` (graph-paused) [#pattern-2-useinterrupt-graph-paused]

With a runtime interrupt, your agent code enforces the pause:

1. The agent interrupts with a serializable payload.
2. The run stops.
3. The client renders your UI with the payload.
4. The user answers, and the client resumes the run with the answer.

CopilotKit's `useInterrupt` composable and `CopilotChat`'s `#interrupt` slot form the Vue render contract.

See the [`useInterrupt` deep dive](/vue/human-in-the-loop/useInterrupt) for the full walkthrough, including the backend contract and Vue slot wiring.

## Going headless [#going-headless]

Both patterns above can drive custom UI. For runtime interrupts, set `renderInChat: false` and use the reactive state returned by `useInterrupt`; for a frontend-tool pause, let the Promise-returning HITL tool drive application state. See the [headless interrupts guide](/vue/human-in-the-loop/headless) for the interrupt path.

<IntegrationGrid path="human-in-the-loop" />
