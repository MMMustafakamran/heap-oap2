<script setup lang="ts">
// HARNESS: the Disclaimer slot snippet is template-only (no script, no imports); imports added so it compiles.
import { CopilotChat, CopilotChatInput } from "@copilotkit/vue/v2";
</script>

<template>
<CopilotChat>
  <template #input="inputProps">
    <CopilotChatInput v-bind="inputProps">
      <template #disclaimer>
        <p class="support-disclaimer">Responses may be inaccurate.</p>
      </template>
    </CopilotChatInput>
  </template>
</CopilotChat>
</template>
