<script setup lang="ts">
// HARNESS: the Slots page shows SupportChat.vue (twice, same file name) and a disclaimer snippet, never the
// provider/app around them; quickstart-style root added. Route query picks the snippet:
//   (none) welcome-screen SupportChat.vue · ?assistant message-view SupportChat.vue · ?disclaimer input slot
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
import SupportChatWelcome from "../components/chat/SupportChatWelcome.vue";
import SupportChat from "../components/chat/SupportChat.vue";
import SupportChatDisclaimer from "../components/chat/SupportChatDisclaimer.vue";
const q = new URLSearchParams(location.search);
</script>

<template>
  <!-- HARNESS: harness runtime 8130 /chat ("default" -> quickstart agent 8131) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/chat/api/copilotkit">
    <div style="height: 100vh">
      <SupportChat v-if="q.has('assistant')" />
      <SupportChatDisclaimer v-else-if="q.has('disclaimer')" />
      <SupportChatWelcome v-else />
    </div>
  </CopilotKitProvider>
</template>
