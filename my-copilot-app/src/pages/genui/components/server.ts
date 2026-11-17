// Components and surfaces page, Vue tab, step 2 "Add the runtime and an agent": server.ts verbatim.
// HARNESS: port 8200 -> 8135 (QA-RULES §4); run: npx tsx --env-file=../backend/.env src/pages/genui/components/server.ts
import { createServer } from "node:http";
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import {
  BuiltInAgent,
  convertInputToTanStackAI,
  CopilotRuntime,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

const agent = new BuiltInAgent({
  type: "tanstack",
  factory: ({ input, abortController }) => {
    const { messages, systemPrompts, tools } = convertInputToTanStackAI(input);
    return chat({
      adapter: openaiText("gpt-6-luna"),
      messages,
      systemPrompts: [
        "You are a helpful assistant. When a visual answer helps, render it with generative UI.",
        ...systemPrompts,
      ],
      tools,
      abortController,
    });
  },
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
});

createServer(
  createCopilotNodeListener({ runtime, basePath: "/api/copilotkit", cors: true }),
).listen(8135, () => { // HARNESS: doc 8200 -> 8135
  console.log("Copilot Runtime listening at http://localhost:8200/api/copilotkit");
});
