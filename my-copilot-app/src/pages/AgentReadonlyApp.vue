<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import WorkspaceContext from "../components/interact/readonly/WorkspaceContext.vue"; // HARNESS: path (doc: ./components/WorkspaceContext.vue)
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 (doc: /api/copilotkit). The page shows no backend: "default" = the quickstart agent on 8131 -->
  <CopilotKitProvider runtime-url="http://localhost:8130/api/copilotkit">
    <WorkspaceContext />
    <CopilotChat />
  </CopilotKitProvider>
</template>
