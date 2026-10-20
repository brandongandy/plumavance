<script setup lang="ts">
import { RouterView } from 'vue-router'

import { useSettingsStore } from './stores/settings.js'

useSettingsStore()
</script>

<template>
  <a
    href="#main-content"
    class="fixed left-2 top-2 z-[1000] -translate-y-20 bg-[var(--color-focus)] px-3 py-2 text-sm font-semibold text-[var(--color-app)] focus:translate-y-0"
  >
    Skip to content
  </a>
  <RouterView />
</template>
