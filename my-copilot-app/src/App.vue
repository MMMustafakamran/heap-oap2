<script setup lang="ts">
// HARNESS: one Vite app, one root per doc page, chosen by path (the docs' main.ts mounts ./App.vue).
// Page agents: add one async route per page; a page whose import is broken only breaks its own route.
import { defineAsyncComponent } from "vue";
import QuickstartApp from "./pages/QuickstartApp.vue";
const page = (l: () => Promise<any>) => defineAsyncComponent(l);
const routes: Record<string, unknown> = {
  "/": QuickstartApp,
  "/quickstart": QuickstartApp,
  // "/frontend-tools": page(() => import("./pages/FrontendToolsApp.vue")),
};
void page;
const Root = routes[location.pathname.replace(/\/$/, "") || "/"] ?? QuickstartApp;
</script>
<template><component :is="Root" /></template>
