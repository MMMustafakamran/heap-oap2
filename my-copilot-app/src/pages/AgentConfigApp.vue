<script setup lang="ts">
// HARNESS: no Vue provider on the page (only React <CopilotKit runtimeUrl="/api/copilotkit-agent-config">).
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
import AgentConfigChat from "../components/chat/AgentConfigChat.vue";
</script>

<template>
  <!-- HARNESS: runtime 8130 /agent-config registers "agent-config-demo" + default -> backend/pages_chat.py agent_config.py -->
  <CopilotKitProvider runtime-url="http://localhost:8130/agent-config/api/copilotkit">
    <AgentConfigChat />
  </CopilotKitProvider>
</template>
