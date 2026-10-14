<script setup lang="ts">
import Button from 'primevue/button'
import { computed, shallowRef, useId } from 'vue'
import { useRouter } from 'vue-router'

import AppLogo from './AppLogo.vue'

type ToolbarAction = 'save' | 'compile' | 'focus'

defineProps<{
  projectName: string
  binderOpen: boolean
  inspectorOpen: boolean
  saveDisabled: boolean
  focusDisabled: boolean
}>()
const emit = defineEmits<{ toggleBinder: []; toggleInspector: []; save: []; compile: [event: Event]; focus: [] }>()
const router = useRouter()
const tooltipId = useId()
const hoveredAction = shallowRef<ToolbarAction | null>(null)
const focusedAction = shallowRef<ToolbarAction | null>(null)
const activeAction = computed(() => hoveredAction.value ?? focusedAction.value)
const primaryKeyLabel = /Mac|iPhone|iPad|iPod/.test(window.navigator.platform) ? 'Cmd' : 'Ctrl'
const tooltips: Record<ToolbarAction, string> = {
  save: `Save (${primaryKeyLabel}+S)`,
  compile: `Show Compile options (${primaryKeyLabel}+Shift+E)`,
  focus: `Enter Focus mode (${primaryKeyLabel}+Shift+Enter)`,
}

function showsTooltip(action: ToolbarAction): boolean {
  return activeAction.value === action
}

function clearHover(action: ToolbarAction): void {
  if (hoveredAction.value === action) hoveredAction.value = null
}

function clearFocus(action: ToolbarAction): void {
  if (focusedAction.value === action) focusedAction.value = null
}
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
    <span
      class="workspace-toolbar-action"
      @mouseenter="hoveredAction = 'save'"
      @mouseleave="clearHover('save')"
      @focusin="focusedAction = 'save'"
      @focusout="clearFocus('save')"
    >
      <Button
        label="Save"
        icon="pi pi-save"
        text
        aria-label="Save document"
        :aria-describedby="showsTooltip('save') ? `${tooltipId}-save` : undefined"
        :disabled="saveDisabled"
        class="workspace-toolbar-button"
        @mouseenter="hoveredAction = 'save'"
        @mouseleave="clearHover('save')"
        @click="emit('save')"
      />
      <span v-if="showsTooltip('save')" :id="`${tooltipId}-save`" role="tooltip" class="workspace-toolbar-tooltip">{{ tooltips.save }}</span>
    </span>
    <span
      class="workspace-toolbar-action workspace-toolbar-action--compile"
      @mouseenter="hoveredAction = 'compile'"
      @mouseleave="clearHover('compile')"
      @focusin="focusedAction = 'compile'"
      @focusout="clearFocus('compile')"
    >
      <Button
        label="Compile"
        icon="pi pi-file-export"
        text
        aria-label="Compile"
        :aria-describedby="showsTooltip('compile') ? `${tooltipId}-compile` : undefined"
        class="workspace-toolbar-button"
        @mouseenter="hoveredAction = 'compile'"
        @mouseleave="clearHover('compile')"
        @click="emit('compile', $event)"
      />
      <span v-if="showsTooltip('compile')" :id="`${tooltipId}-compile`" role="tooltip" class="workspace-toolbar-tooltip">{{ tooltips.compile }}</span>
    </span>
    <span
      class="workspace-toolbar-action workspace-toolbar-action--focus"
      @mouseenter="hoveredAction = 'focus'"
      @mouseleave="clearHover('focus')"
      @focusin="focusedAction = 'focus'"
      @focusout="clearFocus('focus')"
    >
      <Button
        label="Focus"
        icon="pi pi-expand"
        text
        aria-label="Focus"
        :aria-describedby="showsTooltip('focus') ? `${tooltipId}-focus` : undefined"
        :disabled="focusDisabled"
        class="workspace-toolbar-button"
        @mouseenter="hoveredAction = 'focus'"
        @mouseleave="clearHover('focus')"
        @mousedown.prevent
        @click="emit('focus')"
      />
      <span v-if="showsTooltip('focus')" :id="`${tooltipId}-focus`" role="tooltip" class="workspace-toolbar-tooltip">{{ tooltips.focus }}</span>
    </span>
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
