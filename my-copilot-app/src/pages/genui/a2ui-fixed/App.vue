<script setup lang="ts">
// HARNESS: the page's only frontend code is React (`<CopilotKit runtimeUrl="/api/copilotkit" a2ui={{ catalog }}>`
// from @copilotkit/react-core, plus React renderers.tsx / catalog.ts). There is no Vue provider/catalog code, so this is a plain Vue chat on the
// page's runtime config (server.openai.ts prefix /a2ui-fixed).
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
</script>

<template>
  <CopilotKitProvider runtime-url="http://localhost:8130/a2ui-fixed/api/copilotkit">
    <main style="height: 100dvh"><CopilotChat agent-id="a2ui-fixed-schema" /></main>
  </CopilotKitProvider>
</template>
