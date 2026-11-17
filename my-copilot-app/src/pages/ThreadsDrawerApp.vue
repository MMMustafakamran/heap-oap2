<script setup lang="ts">
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  CopilotThreadsDrawer,
} from "@copilotkit/vue/v2";
import NewConversationButton from "../components/chat/NewConversationButton.vue";
import "@copilotkit/vue/styles.css";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite and the page shows no runtime; the Headless Threads
       page's Intelligence runtime on 8130 /threads (server.chat.ts) registers "support". -->
  <CopilotKitProvider
    runtime-url="http://localhost:8130/threads/api/copilotkit"
    public-license-key="ck_pub_..."
  >
    <CopilotChatConfigurationProvider agent-id="support">
      <div style="display: flex; height: 100dvh">
        <CopilotThreadsDrawer />
        <main style="flex: 1; display: flex; flex-direction: column">
          <header><NewConversationButton /></header>
          <CopilotChat />
        </main>
      </div>
    </CopilotChatConfigurationProvider>
  </CopilotKitProvider>
</template>
