<script setup lang="ts">
import Button from 'primevue/button'
import { useRouter } from 'vue-router'

import AppLogo from './AppLogo.vue'

defineProps<{
  projectName: string
  binderOpen: boolean
  inspectorOpen: boolean
  saveDisabled: boolean
}>()
const emit = defineEmits<{ toggleBinder: []; toggleInspector: []; save: []; compile: [event: Event]; focus: [] }>()
const router = useRouter()
</script>

<template>
  <header
    aria-label="Application toolbar"
    class="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-chrome)] px-2"
  >
    <AppLogo class="max-[332px]:h-auto max-[332px]:w-[calc(100vw-19.3125rem)]" />
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
    <Button
      label="Save"
      icon="pi pi-save"
      text
      aria-label="Save document"
      :disabled="saveDisabled"
      class="workspace-toolbar-button"
      @click="emit('save')"
    />
    <Button label="Compile" icon="pi pi-file-export" text class="workspace-toolbar-button" @click="emit('compile', $event)" />
    <Button
      label="Focus"
      icon="pi pi-expand"
      text
      class="workspace-toolbar-button"
      @mousedown.prevent
      @click="emit('focus')"
    />
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
