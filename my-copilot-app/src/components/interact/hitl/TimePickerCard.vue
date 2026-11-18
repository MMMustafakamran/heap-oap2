<script setup lang="ts">
const props = defineProps<{
  args: { topic?: string; attendee?: string };
  respond?: (result: unknown) => Promise<void>;
}>();
</script>

<template>
  <section>
    <p>Pick a time for {{ props.args.topic ?? "the meeting" }}</p>
    <button
      :disabled="!props.respond"
      @click="props.respond?.({ chosen_time: '09:00' })"
    >
      Tomorrow at 09:00
    </button>
  </section>
</template>
