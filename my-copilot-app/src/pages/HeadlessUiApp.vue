<script setup lang="ts">
// HARNESS: the doc's provider snippet is template-only; imports added so it compiles.
import { CopilotChatConfigurationProvider, CopilotKitProvider } from "@copilotkit/vue/v2";
import HeadlessChat from "../components/chat/HeadlessChat.vue";
</script>

<template>
<!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite; harness runtime 8130 /chat registers "my-agent" -->
<CopilotKitProvider runtime-url="http://localhost:8130/chat/api/copilotkit">
  <CopilotChatConfigurationProvider agent-id="my-agent">
    <HeadlessChat />
  </CopilotChatConfigurationProvider>
</CopilotKitProvider>
</template>
