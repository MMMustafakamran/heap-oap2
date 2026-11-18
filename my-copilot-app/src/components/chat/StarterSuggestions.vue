<script setup lang="ts">
// HARNESS: Prebuilt Components "Starter suggestions" shows only this call ("inside a child component of
// CopilotKitProvider"); the child component around it is added so it can run.
import { useConfigureSuggestions } from "@copilotkit/vue/v2";

useConfigureSuggestions({
  suggestions: [{ title: "Summarize", message: "Summarize this page" }],
});
</script>

<template></template>
