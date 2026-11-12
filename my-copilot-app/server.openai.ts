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

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8131/agent"; // HARNESS: doc 8000 -> 8131

function runtimeFor(url: string) {
  return new CopilotRuntime({
    agents: {
      // HARNESS: the landing page registers "openai_agent"; CopilotChat uses "default", so register both.
      default: new HttpAgent({ url }),
      openai_agent: new HttpAgent({ url }),
    },
  });
}

// prefix -> agent URL. Page agents: add "/<page>": "http://localhost:813N/agent".
const RUNTIMES: Record<string, string> = {
  "": AGENT_URL,
};

const listeners = Object.entries(RUNTIMES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([prefix, url]) => ({
    prefix,
    listener: createCopilotNodeListener({
      runtime: runtimeFor(url),
      basePath: `${prefix}/api/copilotkit`,
      cors: true,
    }),
  }));

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
