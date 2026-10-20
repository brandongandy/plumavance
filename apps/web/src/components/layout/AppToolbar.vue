<script setup lang="ts">
import { useRouter } from 'vue-router'

import TooltipButton from '../controls/TooltipButton.vue'
import { provideTooltipGroup } from '../controls/tooltipGroup.js'
import { shortcutLabel } from '../controls/shortcutLabels.js'
import AppLogo from './AppLogo.vue'

defineProps<{
  projectName: string
  binderOpen: boolean
  inspectorOpen: boolean
  saveDisabled: boolean
  focusDisabled: boolean
}>()
const emit = defineEmits<{ toggleBinder: []; toggleInspector: []; save: []; compile: [event: Event]; focus: [] }>()
const router = useRouter()
provideTooltipGroup()
</script>

<template>
  <header
    aria-label="Application toolbar"
    class="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-chrome)] px-2"
  >
    <AppLogo class="max-[332px]:h-auto max-[332px]:w-[calc(100vw-19.3125rem)]" />
    <TooltipButton
      icon="pi pi-chevron-left"
      aria-label="Back to projects"
      tooltip="Back to projects"
      placement="start"
      class="workspace-icon-button"
      @click="router.push('/')"
    />
    <span class="mr-auto min-w-0 truncate px-1 text-xs font-semibold">{{ projectName }}</span>
    <TooltipButton
      icon="pi pi-list"
      aria-label="Show binder"
      tooltip="Show binder"
      :pressed="binderOpen"
      class="workspace-icon-button"
      @click="emit('toggleBinder')"
    />
    <TooltipButton
      label="Save"
      icon="pi pi-save"
      aria-label="Save document"
      :tooltip="`Save (${shortcutLabel('Mod+S')})`"
      :disabled="saveDisabled"
      class="workspace-toolbar-button"
      @click="emit('save')"
    />
    <TooltipButton
      label="Compile"
      icon="pi pi-file-export"
      aria-label="Compile"
      :tooltip="`Show Compile options (${shortcutLabel('Mod+Shift+E')})`"
      placement="end"
      class="workspace-toolbar-button"
      @click="emit('compile', $event)"
    />
    <TooltipButton
      label="Focus"
      icon="pi pi-expand"
      aria-label="Focus"
      :tooltip="`Enter Focus mode (${shortcutLabel('Mod+Shift+Enter')})`"
      :disabled="focusDisabled"
      placement="end"
      class="workspace-toolbar-button"
      @mousedown.prevent
      @click="emit('focus')"
    />
    <TooltipButton
      icon="pi pi-info-circle"
      aria-label="Show inspector"
      tooltip="Show inspector"
      :pressed="inspectorOpen"
      placement="end"
      class="workspace-icon-button"
      @click="emit('toggleInspector')"
    />
  </header>
</template>
