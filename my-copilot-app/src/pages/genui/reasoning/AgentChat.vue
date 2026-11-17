<script setup lang="ts">
import { CopilotChat } from "@copilotkit/vue/v2";
</script>

<template>
  <CopilotChat>
    <template #reasoning-message="{ message, isRunning }">
      <aside class="reasoning" aria-live="polite">
        <strong>{{ isRunning ? "Thinking…" : "Reasoning" }}</strong>
        <p>{{ message.content }}</p>
      </aside>
    </template>
  </CopilotChat>
</template>
