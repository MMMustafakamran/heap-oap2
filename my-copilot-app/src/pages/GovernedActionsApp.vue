<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import GovernedActionApproval from "../components/interact/governed/GovernedActionApproval.vue"; // HARNESS: path (doc: ./components/)
import GovernedActionTool from "../components/interact/governed/GovernedActionTool.vue"; // HARNESS: path (doc: ./components/)
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 (doc: /api/copilotkit). The page shows no agent: "default" = the quickstart agent on 8131 -->
  <CopilotKitProvider runtime-url="http://localhost:8130/api/copilotkit">
    <GovernedActionApproval />
    <GovernedActionTool />
    <CopilotChat />
  </CopilotKitProvider>
</template>
