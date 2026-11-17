<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
// HARNESS: the Sub-Agents page shows no frontend code at all ("Rendering a live delegation log" is empty); provider + chat from the quickstart.
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 /subagents (subagents.py from the page, on 8136) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/subagents/api/copilotkit">
    <CopilotChat />
  </CopilotKitProvider>
</template>
