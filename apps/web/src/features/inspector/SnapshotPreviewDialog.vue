<script setup lang="ts">
import type { SnapshotDto } from '@pluma/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

defineProps<{
  visible: boolean
  snapshot: SnapshotDto | null
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="snapshot?.name || 'Snapshot Preview'"
    :draggable="false"
    class="pluma-dialog snapshot-dialog"
    @update:visible="!$event && emit('close')"
  >
    <p v-if="loading" role="status">Loading snapshot…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <pre v-else aria-label="Snapshot preview" class="snapshot-preview">{{ snapshot?.contentText }}</pre>
    <template #footer>
      <Button label="Close" aria-label="Close snapshot preview" @click="emit('close')" />
    </template>
  </Dialog>
</template>
