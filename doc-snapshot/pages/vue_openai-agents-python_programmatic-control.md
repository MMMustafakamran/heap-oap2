# Programmatic Control

> Drive agent runs directly from code, with no chat UI.

## What is this? [#what-is-this]

Programmatic control is what you reach for when you want to drive an agent run from code rather than from a chat composer: a button, a form, a cron job, a keyboard shortcut, or a graph callback. CopilotKit exposes three primitives that cover every triggering pattern:

- `agent.addMessage(...)`: append a message to the conversation without running the agent. Pair it with `copilotkit.runAgent({ agent })` when the message starts a turn.
- `copilotkit.runAgent({ agent })`: the same entry point that `<CopilotChat />` calls internally. It orchestrates frontend tools, follow-up runs, and the subscriber lifecycle. To build your own chat surface on it, see [Headless UI](/vue/custom-look-and-feel/headless-ui).
- `agent.subscribe(subscriber)`: low-level AG-UI event subscription (`onCustomEvent`, `onRunStartedEvent`, `onRunFinalized`, `onRunFailed`, and streaming deltas).

## When should I use this? [#when-should-i-use-this]

Use programmatic control when you want to:

- Trigger agent runs from buttons, forms, or other UI elements
- Execute specific tools directly from UI interactions without an LLM turn
- Build agent features without a chat window
- Access agent state and results programmatically
- Create fully custom agent-driven workflows

## Sending a message from code [#sending-a-message-from-code]

<Steps>
  <Step>
    ### Install the OpenAI Agents AG-UI adapter

    ```bash
    pip install ag-ui-openai-agents openai-agents
    ```

  </Step>
  <Step>
    ### Wire the agent once, and chat and code share it

    `copilotkit.runAgent`, `agent.subscribe` and `agent.addMessage` drive runs
    against the same AG-UI endpoint your chat UI posts to, so there is no
    second backend to set up. Mount the `OpenAIAgentsAgent` the way any chat
    demo does, and every entry point sees the same model, tools and
    instructions.

~~~~python title="agent_server.py"
app = FastAPI(title="OpenAI Agents SDK Agent Server", lifespan=lifespan)
for name, agent in AGENTS.items():
    add_openai_agents_fastapi_endpoint(app, agent, f"/{name}", include_health=False)
~~~~

    The server keeps no sessions. Every run carries the thread's messages
    from the client, so a headless run on the same agent continues its
    thread, and a fresh `threadId` starts a new one.

  </Step>
</Steps>

<Callout type="info" title="Headless interrupts come from approval-gated tools">
  The headless interrupt-resolver pattern (read the interrupt off the agent,
  answer it with a `resume`) works with a server tool marked
  `needs_approval=True`. The run ends with an interrupt for the call, and a
  `resume` of `{"approved": true}` runs it (see the human-in-the-loop setup).
  To ask the user from code without a backend tool, use the frontend-tool
  Promise pattern: register the tool with `useFrontendTool` and an `async`
  handler, and resolve its promise when your own UI has the answer.
</Callout>

The canonical pattern is to append a user message with `agent.addMessage`, then call `copilotkit.runAgent({ agent })`. Use `copilotkit.stopAgent({ agent })` to cancel an in-flight run.

```vue title="src/components/AgentTrigger.vue"
<script setup lang="ts">
import { toRaw } from "vue";
import { useAgent, useCopilotKit } from "@copilotkit/vue/v2";

const { agent } = useAgent({ agentId: "sales" });
const { copilotkit } = useCopilotKit();

async function run() {
  const current = agent.value;
  if (!current || current.isRunning) return;

  current.addMessage({
    id: crypto.randomUUID(),
    role: "user",
    content: "Summarize the latest sales data",
  });

  try {
    await copilotkit.value.runAgent({ agent: toRaw(current) });
  } catch (error) {
    console.error("CopilotKit runAgent failed:", error);
  }
}

function stop() {
  const current = agent.value;
  if (!current) return;
  copilotkit.value.stopAgent({ agent: toRaw(current) });
}
</script>

<template>
  <button :disabled="agent?.isRunning" @click="run">Run agent</button>
  <button :disabled="!agent?.isRunning" @click="stop">Stop</button>
</template>
```

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import AgentTrigger from "./components/AgentTrigger.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <AgentTrigger />
    <CopilotChat agent-id="sales" />
  </CopilotKitProvider>
</template>
```

Click **Run agent**. The message and the agent's reply appear in the chat, and **Stop** is enabled while the run is in progress.

### `copilotkit.runAgent()` vs `agent.runAgent()` [#copilotkitrunagent-vs-agentrunagent]

Both methods trigger the agent, but they operate at different levels:

- **`copilotkit.runAgent({ agent })`**: the recommended default. It orchestrates the full lifecycle, executes frontend tools, handles follow-up runs, and routes errors through the subscriber system.
- **`agent.runAgent(options)`**: a low-level method on the agent instance. It sends the request to the runtime but does **not** execute frontend tools or chain follow-ups. Reach for it only when you need direct control.

## Subscribing to agent events [#subscribing-to-agent-events]

`agent.subscribe(subscriber)` returns `{ unsubscribe }`. The subscriber accepts every AG-UI lifecycle callback: `onCustomEvent`, `onRunStartedEvent`, `onRunFinalized`, `onRunFailed`, and the streaming deltas. Use it to drive progress UI, forward events to analytics, or inspect framework pause/resume events.

```ts
import { watch } from "vue";

watch(
  agent,
  (current, _previous, onCleanup) => {
    if (!current) return;
    const subscription = current.subscribe({
      onRunStartedEvent: () => console.log("started"),
      onRunFinalized: () => console.log("done"),
      onRunFailed: ({ error }) => console.error(error),
    });
    onCleanup(() => subscription.unsubscribe());
  },
  { immediate: true },
);
```

## Resolving a pause from a button [#resolving-a-pause-from-a-button]

> **Interrupt-style pause/resume isn't available on this framework.** The interrupt path requires either a native runtime interrupt or a Promise-resolving frontend-tool path. Use [`useHumanInTheLoop`](./human-in-the-loop) for tool-call-based pause/resume. The `agent.addMessage`, `copilotkit.runAgent`, and `agent.subscribe` primitives above still apply; only interrupt resolution is framework-specific.

<IntegrationGrid path="programmatic-control" />
