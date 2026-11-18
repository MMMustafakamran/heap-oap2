<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
// HARNESS: child component for the page's useConfigureSuggestions snippet (Starter suggestions)
import StarterSuggestions from "../components/chat/StarterSuggestions.vue";
</script>

<template>
  <!-- HARNESS: doc runtime-url="/api/copilotkit" 404s on Vite (no proxy); harness runtime 8130 /chat registers "my-agent" (never registered on the page) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/chat/api/copilotkit">
    <StarterSuggestions />
    <CopilotChat agent-id="my-agent" />
  </CopilotKitProvider>
</template>
