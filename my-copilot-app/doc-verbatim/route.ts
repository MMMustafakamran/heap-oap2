// VERBATIM: the only runtime code on the rendered Vue quickstart (docs.copilotkit.ai/vue/openai-agents-python,
// "Connect your agent"). It is a Next.js App Router handler (NextRequest); a Vue + Vite app has no place to run it.
// Not compiled or served. FINDINGS.md #1.
import { HttpAgent } from "@ag-ui/client";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import type { NextRequest } from "next/server";

const runtime = new CopilotRuntime({
  agents: {
    openai_agent: new HttpAgent({
      url: process.env.AGENT_URL ?? "http://localhost:8000/agent",
    }),
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  mode: "single-route",
});

export const POST = (req: NextRequest) => handler(req);
