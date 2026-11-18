# Tool Call Rendering

> Render your agent's tool calls with custom UI components.

## What is this? [#what-is-this]

Tools are how an LLM invokes predefined, typically-deterministic functions. Tool rendering lets you decide how each of those tool calls appears in the chat. Instead of showing raw JSON, you register a Vue component that draws a branded card for the call (arguments, live status, and the eventual result). This is the **Generative UI** variant CopilotKit calls **tool rendering**.

## When should I use this? [#when-should-i-use-this]

Render tool calls when you want to:

- Show users exactly what tools the agent is invoking and with what arguments
- Display live progress indicators while a tool executes
- Render rich, polished results once a tool completes
- Give tool-heavy agents a transparent, on-brand chat experience

## Default tool rendering (zero-config) [#default-tool-rendering-zero-config]

The simplest entry point is `useDefaultRenderTool()` with no arguments. CopilotKit registers its built-in default renderer as the `*` wildcard: every tool call renders as a status card (tool name, live **Running → Done** state, collapsible arguments/result) without you writing any UI.

Without this composable, CopilotKit has no `*` renderer and tool calls are not shown. The user only sees the assistant's final text summary.

```vue title="src/components/AgentExperience.vue"
<script setup lang="ts">
import { CopilotChat, useDefaultRenderTool } from "@copilotkit/vue/v2";

useDefaultRenderTool();
</script>

<template><CopilotChat /></template>
```

## Custom catch-all [#custom-catch-all]

Once you want on-brand chrome, pass a `render` component or function to `useDefaultRenderTool`. It's a convenience wrapper around `useRenderTool({ name: "*", ... })`: one wildcard renderer handles every tool call, named or not.

```ts title="src/components/AgentExperience.vue"
useDefaultRenderTool({ render: BrandedToolCard });
```

## Per-tool renderers [#per-tool-renderers]

The most expressive path is one renderer per tool name. Each renderer receives the tool's parsed arguments, a live `status`, and, once the agent returns, the `result`.

1. Write the card component:

   ```vue title="src/components/WeatherToolCard.vue"
   <script setup lang="ts">
   defineProps<{
     parameters: { city?: string };
     status: "inProgress" | "executing" | "complete";
     result?: string;
   }>();
   </script>

   <template>
     <p v-if="status !== 'complete'">Checking {{ parameters.city ?? "…" }}</p>
     <article v-else>
       <strong>{{ parameters.city }}</strong>
       <pre>{{ result }}</pre>
     </article>
   </template>
   ```

2. Register it with `useRenderTool` in a component:

   ```vue title="src/components/AgentExperience.vue"
   <script setup lang="ts">
   import { z } from "zod";
   import { CopilotChat, useDefaultRenderTool, useRenderTool } from "@copilotkit/vue/v2";
   import WeatherToolCard from "./WeatherToolCard.vue";

   useRenderTool({
     name: "get_weather",
     parameters: z.object({ city: z.string() }),
     render: WeatherToolCard,
   });

   useDefaultRenderTool(); // wildcard fallback for every other tool
   </script>

   <template><CopilotChat /></template>
   ```

3. Mount that component under `CopilotKitProvider`:

   ```vue title="src/App.vue"
   <script setup lang="ts">
   import { CopilotKitProvider } from "@copilotkit/vue/v2";
   import AgentExperience from "./components/AgentExperience.vue";
   </script>

   <template>
     <CopilotKitProvider runtime-url="/api/copilotkit"><AgentExperience /></CopilotKitProvider>
   </template>
   ```

`parameters` is partial while arguments stream. Read required fields only after the status advances from `inProgress`. The result is a string when status is `complete`; parse it only if your backend deliberately returns a documented serialized shape.

<Callout type="info">
  The `name` you pass to `useRenderTool` must match the tool name the agent exposes. That is how CopilotKit routes the call to your component.
</Callout>

Per-tool renderers compose with a catch-all: named renderers claim the "interesting" tools and a wildcard handles everything else. The example registers the built-in wildcard after the named `get_weather` renderer.

If the renderer closes over reactive values, pass Vue watch sources as the second argument:

```ts
useRenderTool({ name: "get_weather", parameters, render: WeatherToolCard }, [locale]);
```

## The backend tool definition [#the-backend-tool-definition]

The frontend renderer only sees what the agent sends down. The matching backend must expose a tool named `get_weather`, return structured data, and let the frontend renderer with the same name paint the card. The Vue renderer does not create or execute that backend tool.

<Steps>
  <Step>
    ### Pass the backend tools to the agent

    Backend tools are ordinary `@function_tool` functions. Pass them as
    `tools=[...]`: the SDK derives each schema from the signature and
    docstring and runs the call in this process when the model asks for it.
    The adapter streams every call to the browser as `TOOL_CALL_START`,
    `TOOL_CALL_ARGS` and `TOOL_CALL_END`, then `TOOL_CALL_RESULT` with the
    returned value, so a frontend renderer registered under the same name
    paints the card.

~~~~python title="tool_rendering.py"
TOOLS = [get_weather, search_flights, get_stock_price, roll_d20]


tool_rendering_agent = Agent(
    name="concierge",
    instructions=SYSTEM_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
    tools=TOOLS,
)


~~~~

  </Step>
</Steps>

<Callout type="info" title="Arguments stream as the model writes them">
  `TOOL_CALL_ARGS` arrives in pieces while the model generates the call, so
  a renderer can show partial arguments during `inProgress`, before the call
  executes and completes.
</Callout>

```python title="src/demo_agents/tool_rendering.py"
@function_tool
def get_weather(location: str) -> dict:
    """Get the current weather for a given location."""
    return {
        "city": location,
        "temperature": 68,
        "humidity": 55,
        "wind_speed": 10,
        "conditions": "Sunny",
    }

```

<IntegrationGrid path="generative-ui/tool-rendering" />
