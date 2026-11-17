<script setup lang="ts">
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import DashboardAgent from "./components/DashboardAgent.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite (no proxy shown); harness runtime on 8130 (quickstart agent). -->
  <CopilotKitProvider runtime-url="http://localhost:8130/api/copilotkit">
    <DashboardAgent />
  </CopilotKitProvider>
</template>
