<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { computed } from 'vue'

import { buildSnapshotDiff } from './snapshotDiff.js'

const props = defineProps<{
  visible: boolean
  currentText: string
  snapshotText: string
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ close: [] }>()
const parts = computed(() => buildSnapshotDiff(props.currentText, props.snapshotText))
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Compare Snapshot"
    :draggable="false"
    class="pluma-dialog snapshot-dialog"
    @update:visible="!$event && emit('close')"
  >
    <p v-if="loading" role="status">Loading snapshot…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <div v-else aria-label="Snapshot comparison" class="snapshot-comparison">
      <template v-for="(part, index) in parts" :key="index">
        <ins v-if="part.kind === 'added'"><span class="sr-only">Added: </span>{{ part.text }}</ins>
        <del v-else-if="part.kind === 'removed'"><span class="sr-only">Removed: </span>{{ part.text }}</del>
        <span v-else>{{ part.text }}</span>
      </template>
    </div>
    <template #footer>
      <Button label="Close" aria-label="Close snapshot comparison" @click="emit('close')" />
    </template>
  </Dialog>
</template>
