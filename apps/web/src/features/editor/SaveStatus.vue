<script setup lang="ts">
import Button from 'primevue/button'

import TooltipButton from '../../components/controls/TooltipButton.vue'
import { shortcutLabel } from '../../components/controls/shortcutLabels.js'
import type { SaveState } from '../../stores/document.js'

defineProps<{ state: SaveState; message?: string | undefined }>()
const emit = defineEmits<{ save: []; reload: []; keepMine: [] }>()

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
    <TooltipButton
      icon="pi pi-save"
      :aria-label="state === 'failed' ? 'Retry save' : 'Save document'"
      :tooltip="`${state === 'failed' ? 'Retry save' : 'Save'} (${shortcutLabel('Mod+S')})`"
      :disabled="state === 'saved' || state === 'saving' || state === 'conflict'"
      placement="start"
      @click="emit('save')"
    />
    <span>{{ labels[state] }}</span>
    <span v-if="message && (state === 'failed' || state === 'conflict')" class="save-status-message">{{ message }}</span>
    <template v-if="state === 'conflict'">
      <Button label="Reload server copy" text @click="emit('reload')" />
      <Button label="Keep mine" text @click="emit('keepMine')" />
    </template>
  </div>
</template>
