<script setup lang="ts">
import type { SnapshotDto } from '@scr/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

defineProps<{ visible: boolean; snapshot: SnapshotDto | null }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="snapshot?.name || 'Snapshot Preview'"
    :draggable="false"
    class="scr-dialog snapshot-dialog"
    @update:visible="!$event && emit('close')"
  >
    <pre aria-label="Snapshot preview" class="snapshot-preview">{{ snapshot?.contentText }}</pre>
    <template #footer>
      <Button label="Close" aria-label="Close snapshot preview" @click="emit('close')" />
    </template>
  </Dialog>
</template>
