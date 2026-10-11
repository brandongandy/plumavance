<script setup lang="ts">
import Button from 'primevue/button'
import { useRouter } from 'vue-router'

defineProps<{ projectName: string; binderOpen: boolean; inspectorOpen: boolean }>()
const emit = defineEmits<{ toggleBinder: []; toggleInspector: [] }>()
const router = useRouter()
</script>

<template>
  <header
    aria-label="Application toolbar"
    class="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-chrome)] px-2"
  >
    <Button
      icon="pi pi-chevron-left"
      text
      aria-label="Back to projects"
      class="workspace-icon-button"
      @click="router.push('/')"
    />
    <span class="mr-auto min-w-0 truncate px-1 text-xs font-semibold">{{ projectName }}</span>
    <Button
      icon="pi pi-list"
      text
      aria-label="Show binder"
      :aria-pressed="binderOpen"
      class="workspace-icon-button"
      @click="emit('toggleBinder')"
    />
    <Button label="Save" icon="pi pi-save" text disabled class="workspace-toolbar-button" />
    <Button label="Compile" icon="pi pi-file-export" text disabled class="workspace-toolbar-button" />
    <Button label="Focus" icon="pi pi-expand" text disabled class="workspace-toolbar-button" />
    <Button
      icon="pi pi-info-circle"
      text
      aria-label="Show inspector"
      :aria-pressed="inspectorOpen"
      class="workspace-icon-button"
      @click="emit('toggleInspector')"
    />
  </header>
</template>
