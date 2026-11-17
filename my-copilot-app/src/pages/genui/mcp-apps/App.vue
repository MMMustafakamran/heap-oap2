<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; harness runtime 8130, /mcp-apps prefix = runtime with the doc's mcpApps block. -->
  <CopilotKitProvider runtime-url="http://localhost:8130/mcp-apps/api/copilotkit">
    <main style="height: 100dvh"><CopilotChat /></main>
  </CopilotKitProvider>
</template>
