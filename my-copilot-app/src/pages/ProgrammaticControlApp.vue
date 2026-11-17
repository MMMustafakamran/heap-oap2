<script setup lang="ts">
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import AgentTrigger from "../components/chat/AgentTrigger.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; harness runtime 8130 /programmatic-control registers "sales" -> backend/pages_chat.py -->
  <CopilotKitProvider runtime-url="http://localhost:8130/programmatic-control/api/copilotkit">
    <AgentTrigger />
  </CopilotKitProvider>
</template>
