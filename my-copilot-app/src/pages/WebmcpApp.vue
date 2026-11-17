<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
// HARNESS: the WebMCP page shows OrderSearch.vue only ("must run inside your existing CopilotKitProvider"); provider + chat from the quickstart.
import OrderSearch from "../components/interact/webmcp/OrderSearch.vue";
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130, quickstart agent on 8131 -->
  <CopilotKitProvider runtime-url="http://localhost:8130/api/copilotkit">
    <OrderSearch />
    <CopilotChat />
  </CopilotKitProvider>
</template>
