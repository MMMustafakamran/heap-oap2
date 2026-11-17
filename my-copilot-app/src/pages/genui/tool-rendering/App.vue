<script setup lang="ts">
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import AgentExperience from "./components/AgentExperience.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; harness runtime 8130, /tool-rendering prefix = backend/pages_genui.py (8134). -->
  <CopilotKitProvider runtime-url="http://localhost:8130/tool-rendering/api/copilotkit"><AgentExperience /></CopilotKitProvider>
</template>
