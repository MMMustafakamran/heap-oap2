<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import StreamingDocument from "../components/interact/streaming/StreamingDocument.vue"; // HARNESS: path (doc: ./components/StreamingDocument.vue)
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 /shared-state-streaming (doc: /api/copilotkit), DocumentStreamingAgent on 8136 -->
  <CopilotKitProvider runtime-url="http://localhost:8130/shared-state-streaming/api/copilotkit">
    <StreamingDocument />
    <CopilotChat agent-id="writer" />
  </CopilotKitProvider>
</template>
