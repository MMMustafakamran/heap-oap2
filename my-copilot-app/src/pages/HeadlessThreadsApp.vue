<script setup lang="ts">
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
} from "@copilotkit/vue/v2";
import ThreadSidebar from "../components/chat/ThreadSidebar.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; the page's step-1 server.ts runs on 8130 /threads (server.chat.ts) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/threads/api/copilotkit">
    <CopilotChatConfigurationProvider agent-id="my-agent">
      <div class="flex" style="height: 100dvh">
        <ThreadSidebar />
        <CopilotChat />
      </div>
    </CopilotChatConfigurationProvider>
  </CopilotKitProvider>
</template>
