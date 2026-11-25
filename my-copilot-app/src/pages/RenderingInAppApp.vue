<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import Canvas from "../components/interact/rendering/Canvas.vue"; // CHANGED: path (doc: ./components/Canvas.vue)
</script>

<template>
  <!-- CHANGED: runtime-url -> harness runtime 8130 /shared-state (doc: /api/copilotkit). The page shows no backend and says "the same agent" as Shared State (linked), so this uses the Shared State page agent on 8136 -->
  <CopilotKitProvider runtime-url="http://localhost:8130/shared-state/api/copilotkit">
    <div class="app-shell">
      <Canvas />
      <CopilotChat />
    </div>
  </CopilotKitProvider>
</template>
