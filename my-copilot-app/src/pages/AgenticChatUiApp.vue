<script setup lang="ts">
// HARNESS: the page only shows React/Next code (page.tsx: <CopilotKit runtimeUrl agent>, kept verbatim in
// components/chat/agentic-chat/page.tsx.txt); it can't run in Vue. Vue equivalent written by hand.
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
import Chat from "../components/chat/agentic-chat/Chat.vue";
</script>

<template>
  <!-- HARNESS: React <CopilotKit runtimeUrl="/api/copilotkit" agent="agentic_chat"> -> Vue CopilotKitProvider + agent-id -->
  <CopilotKitProvider runtime-url="http://localhost:8130/agentic-chat-ui/api/copilotkit">
    <div style="height: 100vh">
      <Chat />
    </div>
  </CopilotKitProvider>
</template>
