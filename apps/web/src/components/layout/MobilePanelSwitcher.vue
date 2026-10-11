<script setup lang="ts">
import type { WorkspacePanel } from '../../stores/workspace.js'

defineProps<{ activePanel: WorkspacePanel }>()
const emit = defineEmits<{ select: [panel: WorkspacePanel] }>()
</script>

<template>
  <nav aria-label="Mobile panel switcher" class="mobile-panel-switcher">
    <button
      v-for="panel in (['binder', 'editor', 'inspector'] as const)"
      :key="panel"
      type="button"
      :aria-label="`${panel[0]?.toUpperCase()}${panel.slice(1)} panel`"
      :aria-current="activePanel === panel ? 'page' : undefined"
      @click="emit('select', panel)"
    >
      {{ panel[0]?.toUpperCase() }}{{ panel.slice(1) }}
    </button>
  </nav>
</template>
