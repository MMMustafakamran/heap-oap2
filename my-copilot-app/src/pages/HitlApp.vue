<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
// HARNESS: the HITL overview shows MeetingApproval.vue only ("Mount the registration component beneath CopilotKitProvider"); provider + chat from the quickstart.
import MeetingApproval from "../components/interact/hitl/MeetingApproval.vue";
</script>

<template>
  <!-- HARNESS: runtime-url -> harness runtime 8130 /hitl (hitl.py from the page, on 8136) -->
  <CopilotKitProvider runtime-url="http://localhost:8130/hitl/api/copilotkit">
    <MeetingApproval />
    <CopilotChat />
  </CopilotKitProvider>
</template>
