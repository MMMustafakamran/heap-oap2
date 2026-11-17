<script setup lang="ts">
// HARNESS: one Vite app, one root per doc page, chosen by path (the docs' main.ts mounts ./App.vue).
// Page agents: add one async route per page; a page whose import is broken only breaks its own route.
import { defineAsyncComponent } from "vue";
import QuickstartApp from "./pages/QuickstartApp.vue";
const page = (l: () => Promise<any>) => defineAsyncComponent(l);
const routes: Record<string, unknown> = {
  "/": QuickstartApp,
  "/quickstart": QuickstartApp,
  // "/frontend-tools": page(() => import("./pages/FrontendToolsApp.vue")),
  // genui pages
  "/frontend-tools": page(() => import("./pages/FrontendToolsApp.vue")),
  "/tool-based": page(() => import("./pages/ToolBasedApp.vue")),
  "/tool-rendering": page(() => import("./pages/ToolRenderingApp.vue")),
  "/state-rendering": page(() => import("./pages/StateRenderingApp.vue")),
  "/mcp-apps": page(() => import("./pages/McpAppsApp.vue")),
  "/reasoning": page(() => import("./pages/ReasoningApp.vue")),
  "/generative-ui-components": page(() => import("./pages/GenerativeUiComponentsApp.vue")),
  "/a2ui": page(() => import("./pages/A2uiApp.vue")),
  "/a2ui-dynamic": page(() => import("./pages/A2uiDynamicApp.vue")),
  "/a2ui-fixed": page(() => import("./pages/A2uiFixedApp.vue")),
  // chat pages
  "/prebuilt-components": page(() => import("./pages/PrebuiltComponentsApp.vue")),
  "/slots": page(() => import("./pages/SlotsApp.vue")),
  "/headless-ui": page(() => import("./pages/HeadlessUiApp.vue")),
  "/programmatic-control": page(() => import("./pages/ProgrammaticControlApp.vue")),
  "/threads-drawer": page(() => import("./pages/ThreadsDrawerApp.vue")),
  "/headless-threads": page(() => import("./pages/HeadlessThreadsApp.vue")),
  "/agentic-chat-ui": page(() => import("./pages/AgenticChatUiApp.vue")),
  "/agent-config": page(() => import("./pages/AgentConfigApp.vue")),
  "/inspector": page(() => import("./pages/InspectorApp.vue")),
  // interact pages
  "/shared-state": page(() => import("./pages/SharedStateApp.vue")),
  "/shared-state-rendering": page(() => import("./pages/RenderingInAppApp.vue")),
  "/shared-state-streaming": page(() => import("./pages/StreamingApp.vue")),
  "/shared-state-readonly": page(() => import("./pages/AgentReadonlyApp.vue")),
  "/hitl": page(() => import("./pages/HitlApp.vue")),
  "/governed-actions": page(() => import("./pages/GovernedActionsApp.vue")),
  "/webmcp": page(() => import("./pages/WebmcpApp.vue")),
  "/subagents": page(() => import("./pages/SubagentsApp.vue")),
};
void page;
const Root = routes[location.pathname.replace(/\/$/, "") || "/"] ?? QuickstartApp;
</script>
<template><component :is="Root" /></template>
