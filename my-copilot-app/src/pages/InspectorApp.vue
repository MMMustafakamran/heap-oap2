<script setup lang="ts">
// HARNESS: the Inspector page has no Vue snippet; it says Inspector "appears by default in development builds of
// React, Vue, and Angular". Minimal quickstart-style app to check that.
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
</script>

<template>
  <CopilotKitProvider runtime-url="http://localhost:8130/chat/api/copilotkit">
    <div style="height: 100vh">
      <CopilotChat />
    </div>
  </CopilotKitProvider>
</template>
