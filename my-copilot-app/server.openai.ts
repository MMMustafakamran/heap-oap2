// HARNESS: the Vue quickstart (rendered) shows no Vue runtime for an OpenAI Agents SDK agent; its only code is a
// Next.js route handler (doc-verbatim/route.ts, kept verbatim, can't run in Vite). FINDINGS.md #1.
// This is the Vue quickstart's .md-export server.ts (createCopilotNodeListener) with the landing page's
// HttpAgent in place of BuiltInAgent. One CopilotRuntime per path prefix, so page agents can be added later:
//   /api/copilotkit            -> 8131 quickstart agent (backend/main.py, React quickstart's main.py)
//   /<page>/api/copilotkit     -> 8132-8139 page agents (add to RUNTIMES below)
// Port 8130 (doc: 8200, QA-RULES §4).
import { createServer } from "node:http";
import { HttpAgent } from "@ag-ui/client";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { chatListeners } from "./server.chat"; // HARNESS (chat pages): their runtimes, see server.chat.ts

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8131/agent"; // HARNESS: doc 8000 -> 8131

// HARNESS (genui): extra CopilotRuntime options per prefix (MCP Apps / A2UI blocks from the docs).
function runtimeFor(url: string, extra: Record<string, unknown> = {}) {
  return new CopilotRuntime({
    ...extra,
    agents: {
      // HARNESS: the landing page registers "openai_agent"; CopilotChat uses "default", so register both.
      default: new HttpAgent({ url }),
      openai_agent: new HttpAgent({ url }),
      // HARNESS: Shared State uses agentId "workspace", State Streaming "writer"; same agent under those names.
      workspace: new HttpAgent({ url }),
      writer: new HttpAgent({ url }),
      // HARNESS (genui): State Rendering uses agentId "researcher".
      researcher: new HttpAgent({ url }),
      // HARNESS (genui): A2UI Fixed Schema registers its agent as "a2ui-fixed-schema".
      "a2ui-fixed-schema": new HttpAgent({ url }),
    },
  });
}

// prefix -> agent URL. Page agents: add "/<page>": "http://localhost:813N/agent".
const RUNTIMES: Record<string, string> = {
  "": AGENT_URL,
  // HARNESS (interact pages): page agents from backend/interact/app.py on 8136
  "/shared-state": "http://localhost:8136/shared-state",
  "/shared-state-streaming": "http://localhost:8136/shared-state-streaming",
  "/hitl": "http://localhost:8136/hitl",
  "/subagents": "http://localhost:8136/subagents",
};

// HARNESS (genui): genui page agents from backend/genui/app.py on 8134; MCP Apps on the quickstart agent.
Object.assign(RUNTIMES, {
  "/tool-rendering": "http://localhost:8134/tool-rendering",
  "/state-rendering": "http://localhost:8134/state-rendering",
  "/reasoning": "http://localhost:8134/reasoning",
  "/mcp-apps": AGENT_URL,
  "/a2ui": AGENT_URL,
  "/a2ui-fixed": "http://localhost:8134/a2ui-fixed",
});
const RUNTIME_OPTIONS: Record<string, Record<string, unknown>> = {};
// doc (MCP Apps, server.ts), the mcpApps block verbatim except the url. The doc's `agents: { default: agent }`
// uses an `agent` it never defines: the HttpAgent from runtimeFor() stands in.
RUNTIME_OPTIONS["/mcp-apps"] = {
  mcpApps: {
    servers: [
      {
        type: "http",
        url: process.env.MCP_URL ?? "https://mcp.excalidraw.com/mcp", // HARNESS: doc placeholder https://mcp.example.com/mcp; Excalidraw is the page's own example server
        serverId: "support-tools",
      },
    ],
  },
};

// doc (A2UI, "Enable on the runtime without a catalog"): `a2ui: { injectA2UITool: true }` (agents: the HttpAgent;
// the doc's `runner: new InMemoryAgentRunner()` is the runtime default). A2UI and Dynamic Schema both use it:
// their only provider code is React (`<CopilotKit a2ui={{ catalog }}>`), with no Vue equivalent.
RUNTIME_OPTIONS["/a2ui"] = { a2ui: { injectA2UITool: true } };
// doc (A2UI Fixed Schema, "Registering the runtime"), verbatim block.
RUNTIME_OPTIONS["/a2ui-fixed"] = { a2ui: { injectA2UITool: false, agents: ["a2ui-fixed-schema"] } };

const listeners = Object.entries(RUNTIMES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([prefix, url]) => ({
    prefix,
    listener: createCopilotNodeListener({
      runtime: runtimeFor(url, RUNTIME_OPTIONS[prefix]),
      basePath: `${prefix}/api/copilotkit`,
      cors: true,
    }),
  }));

listeners.unshift(...chatListeners); // HARNESS (chat pages): before the "" fallback

const port = Number(process.env.PORT ?? 8130);

createServer((req, res) => {
  const hit = listeners.find((l) => (req.url ?? "").startsWith(`${l.prefix}/api/copilotkit`));
  if (!hit) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  return hit.listener(req, res);
}).listen(port, () => {
  console.log(`Copilot Runtime listening at http://localhost:${port}/api/copilotkit`);
});
