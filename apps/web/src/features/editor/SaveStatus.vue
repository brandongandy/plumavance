<script setup lang="ts">
import Button from 'primevue/button'

import type { SaveState } from '../../stores/document.js'

defineProps<{ state: SaveState; message?: string }>()
const emit = defineEmits<{ retry: []; reload: []; keepMine: [] }>()

const labels: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  failed: 'Save failed',
  conflict: 'Conflict',
}
</script>

<template>
  <div
    class="save-status"
    :class="`is-${state}`"
    :role="state === 'failed' || state === 'conflict' ? 'alert' : 'status'"
  >
    <span>{{ labels[state] }}</span>
    <span v-if="message && (state === 'failed' || state === 'conflict')" class="save-status-message">{{ message }}</span>
    <Button v-if="state === 'failed'" label="Retry" text @click="emit('retry')" />
    <template v-else-if="state === 'conflict'">
      <Button label="Reload server copy" text @click="emit('reload')" />
      <Button label="Keep mine" text @click="emit('keepMine')" />
    </template>
  </div>
</template>
