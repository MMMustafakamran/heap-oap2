<script setup lang="ts">
// Vue quickstart src/App.vue (the .md export's Vue steps; the rendered page shows none, FINDINGS.md #1).
import { CopilotKitProvider, CopilotChat } from "@copilotkit/vue/v2";
</script>

<template>
  <!-- HARNESS: runtime port 8200 -> 8130 (QA-RULES §4) -->
  <CopilotKitProvider
    runtime-url="http://localhost:8130/api/copilotkit"
  >
    <div style="height: 100vh">
      <CopilotChat />
    </div>
  </CopilotKitProvider>
</template>
