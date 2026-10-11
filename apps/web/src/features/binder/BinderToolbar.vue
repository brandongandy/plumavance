<script setup lang="ts">
import Button from 'primevue/button'

defineProps<{ canAct: boolean }>()
const emit = defineEmits<{ addFolder: []; addDocument: []; rename: []; trash: [] }>()
</script>

<template>
  <div class="binder-toolbar" aria-label="Binder actions">
    <Button icon="pi pi-folder-plus" text aria-label="New folder" @click="emit('addFolder')" />
    <Button icon="pi pi-file-plus" text aria-label="New document" @click="emit('addDocument')" />
    <Button icon="pi pi-pencil" text aria-label="Rename selected item" :disabled="!canAct" @click="emit('rename')" />
    <Button icon="pi pi-trash" text aria-label="Move selected item to Trash" :disabled="!canAct" @click="emit('trash')" />
  </div>
</template>
