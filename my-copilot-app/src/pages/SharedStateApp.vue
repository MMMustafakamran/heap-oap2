<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import SharedWorkspace from "../components/interact/shared-state/SharedWorkspace.vue"; // HARNESS: path (doc: ./components/SharedWorkspace.vue)
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 /shared-state (doc: /api/copilotkit, no proxy or runtime shown) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/shared-state/api/copilotkit">
    <SharedWorkspace />
    <CopilotChat agent-id="workspace" />
  </CopilotKitProvider>
</template>
