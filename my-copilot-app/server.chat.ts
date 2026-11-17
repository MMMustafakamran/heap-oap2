// HARNESS: runtimes for the "chat" page group, mounted by server.openai.ts on 8130 (one per path prefix).
// The Vue pages use runtime-url="/api/copilotkit", which 404s on Vite (no proxy, no runtime on 5130), and agent
// ids no page registers ("my-agent", "sales", "support"), so each prefix registers the ids its page uses:
//   /chat/api/copilotkit           default + my-agent -> quickstart agent 8131 (Prebuilt Components, Slots,
//                                  Headless UI, Inspector)
//   /programmatic-control/...      sales -> backend/pages_chat.py 8132 /sales
//   /agentic-chat-ui/...           default + agentic_chat -> 8132 /agentic_chat
//   /agent-config/...              default + agent-config-demo -> 8132 /agent_config
//   /threads/api/copilotkit        Headless Threads step 1 server.ts (Intelligence), also used by Threads Drawer
import { HttpAgent } from "@ag-ui/client";
import { CopilotKitIntelligence, CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

try {
  process.loadEnvFile(".env.intelligence"); // HARNESS: local key file (gitignored); CI passes the env var
} catch {}

const Q = process.env.AGENT_URL ?? "http://localhost:8131/agent"; // quickstart agent
const P = process.env.CHAT_PAGES_URL ?? "http://localhost:8132"; // backend/pages_chat.py
const http = (url: string) => new HttpAgent({ url });

const runtimes: Record<string, CopilotRuntime> = {
  "/chat": new CopilotRuntime({ agents: { default: http(Q), "my-agent": http(Q) } }),
  "/programmatic-control": new CopilotRuntime({ agents: { sales: http(`${P}/sales`) } }),
  "/agentic-chat-ui": new CopilotRuntime({
    agents: { default: http(`${P}/agentic_chat`), agentic_chat: http(`${P}/agentic_chat`) },
  }),
  "/agent-config": new CopilotRuntime({
    agents: { default: http(`${P}/agent_config`), "agent-config-demo": http(`${P}/agent_config`) },
  }),
};

const agent = http(Q); // HARNESS: the Headless Threads server.ts uses an undefined `agent`

async function verifyAppSession(_request: Request) {
  return { user: { id: "oai-vue-qa-user", name: "OAI Vue QA" } }; // HARNESS: never defined on the page; no auth here
}

// Only with a key: a missing key must not crash the shared runtime for the other pages.
if (process.env.CPK_INTELLIGENCE_API_KEY) {
  // --- Headless Threads doc, step 1 server.ts (verbatim apart from HARNESS lines) ---
  const runtime = new CopilotRuntime({
    agents: {
      default: agent,
      support: agent, // HARNESS: Threads Drawer's agent-id="support", never registered
      "my-agent": agent, // HARNESS: Headless Threads' agent-id="my-agent"; server.ts registers only `default`
    },
    intelligence: new CopilotKitIntelligence({
      apiKey: process.env.CPK_INTELLIGENCE_API_KEY!,
    }),
    identifyUser: async (request) => {
      const session = await verifyAppSession(request);
      if (!session?.user) throw new Error("Unauthorized");
      return { id: session.user.id, name: session.user.name };
    },
    // generateThreadNames: false,
    // lockTtlSeconds: 20,
    // lockHeartbeatIntervalSeconds: 15,
    // lockKeyPrefix: "my-app",
  });
  // --- end doc ---
  runtimes["/threads"] = runtime;
} else {
  console.warn("[server.chat] CPK_INTELLIGENCE_API_KEY not set: /threads runtime not mounted");
}

export const chatListeners = Object.entries(runtimes).map(([prefix, runtime]) => ({
  prefix,
  listener: createCopilotNodeListener({ runtime, basePath: `${prefix}/api/copilotkit`, cors: true }),
}));
