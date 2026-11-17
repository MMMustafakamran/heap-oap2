<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import ResearchProgress from "./components/ResearchProgress.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; harness runtime 8130, /state-rendering prefix = backend/pages_genui.py (8134). -->
  <CopilotKitProvider runtime-url="http://localhost:8130/state-rendering/api/copilotkit">
    <ResearchProgress />
    <CopilotChat agent-id="researcher" />
  </CopilotKitProvider>
</template>
