<script setup lang="ts">
// HARNESS: the page's <Chat /> is never shown; a Vue child that calls the doc's suggestions hook and renders CopilotChat.
import { CopilotChat } from "@copilotkit/vue/v2";
import { useAgenticChatSuggestions } from "./suggestions";
useAgenticChatSuggestions();
</script>

<template>
  <CopilotChat agent-id="agentic_chat" />
</template>
