<script setup lang="ts">
// HARNESS: the Agent Config page has no Vue code at all: its only frontend files (page.tsx, config-card.tsx,
// use-agent-config.ts, route.ts in the demo cell's Code tab) are React / Next.js. This is a hand-written Vue
// stand-in for "the page publishes its typed config with useAgentContext".
import { reactive } from "vue";
import { CopilotChat, useAgentContext } from "@copilotkit/vue/v2";

const config = reactive({ tone: "professional", expertise: "intermediate", responseLength: "concise" });
useAgentContext({ description: "User response preferences", value: () => ({ ...config }) });
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100vh">
    <div style="display: flex; gap: 12px; padding: 8px">
      <label>Tone
        <select v-model="config.tone" aria-label="Tone">
          <option>professional</option><option>casual</option><option>enthusiastic</option>
        </select>
      </label>
      <label>Expertise
        <select v-model="config.expertise" aria-label="Expertise">
          <option>beginner</option><option>intermediate</option><option>expert</option>
        </select>
      </label>
      <label>Length
        <select v-model="config.responseLength" aria-label="Response length">
          <option>concise</option><option>detailed</option>
        </select>
      </label>
    </div>
    <CopilotChat agent-id="agent-config-demo" style="flex: 1" />
  </div>
</template>
