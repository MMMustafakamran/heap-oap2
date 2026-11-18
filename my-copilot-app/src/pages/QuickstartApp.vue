<script setup lang="ts">
// Vue quickstart src/App.vue, verbatim (runtime: my-copilot-app/server.ts, BuiltInAgent; FINDINGS.md #1).
import { CopilotKitProvider, CopilotChat } from "@copilotkit/vue/v2";
</script>

<template>
  <!-- HARNESS: runtime port 8200 -> 8135 (server.ts via its PORT override, QA-RULES §4) -->
  <CopilotKitProvider
    runtime-url="http://localhost:8135/api/copilotkit"
  >
    <div style="height: 100vh">
      <CopilotChat />
    </div>
  </CopilotKitProvider>
</template>
