<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import { standardUI } from "@copilotkit/vue/v2/generative-ui";
</script>

<template>
  <!-- HARNESS: runtime port 8200 -> 8135 (the page's own server.ts, QA-RULES §4) -->
  <CopilotKitProvider
    runtime-url="http://localhost:8135/api/copilotkit"
    :generativeUI="{ ui: standardUI }"
  >
    <div style="height: 100vh">
      <CopilotChat />
    </div>
  </CopilotKitProvider>
</template>
