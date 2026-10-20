<script setup lang="ts">
import TooltipButton from '../../components/controls/TooltipButton.vue'
import { provideTooltipGroup } from '../../components/controls/tooltipGroup.js'

defineProps<{ canAct: boolean }>()
const emit = defineEmits<{ addFolder: []; addDocument: []; rename: []; trash: [] }>()
provideTooltipGroup()
</script>

<template>
  <div class="binder-toolbar" aria-label="Binder actions">
    <TooltipButton icon="pi pi-folder-plus" aria-label="New folder" tooltip="New folder" @click="emit('addFolder')" />
    <TooltipButton icon="pi pi-file-plus" aria-label="New document" tooltip="New document" @click="emit('addDocument')" />
    <TooltipButton
      icon="pi pi-pencil"
      aria-label="Rename selected item"
      tooltip="Rename selected item (F2)"
      :disabled="!canAct"
      @click="emit('rename')"
    />
    <TooltipButton
      icon="pi pi-trash"
      aria-label="Move selected item to Trash"
      tooltip="Move selected item to Trash (Delete)"
      :disabled="!canAct"
      placement="end"
      @click="emit('trash')"
    />
  </div>
</template>
