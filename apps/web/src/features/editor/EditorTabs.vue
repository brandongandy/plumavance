<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'

import TooltipButton from '../../components/controls/TooltipButton.vue'
import type { SplitOrientation } from '../../stores/workspace.js'

withDefaults(defineProps<{
  tabs: { id: string; title: string }[]
  activeId: string | null
  splitIds?: readonly string[]
  splitOrientation?: SplitOrientation | null
}>(), { splitIds: () => [], splitOrientation: null })

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string, closeOthers: boolean]
  split: [orientation: SplitOrientation]
  exitSplit: []
}>()

const tabStrip = useTemplateRef<HTMLElement>('tabStrip')

async function closeTab(id: string, index: number, event: MouseEvent): Promise<void> {
  emit('close', id, event.altKey)
  await nextTick()

  if (tabStrip.value?.querySelector(`[data-tab-id="${id}"]`)) return
  const remainingTabs = tabStrip.value?.querySelectorAll<HTMLElement>('[data-editor-tab]') ?? []
  remainingTabs[Math.min(index, remainingTabs.length - 1)]
    ?.querySelector<HTMLButtonElement>('.editor-tab-title')
    ?.focus()
}
</script>

<template>
  <div ref="tabStrip" role="group" aria-label="Open documents" class="editor-tabs">
    <div class="editor-tabs-scroll">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        data-editor-tab
        :data-tab-id="tab.id"
        class="editor-tab"
        :class="{ 'is-active': tab.id === activeId, 'is-split': splitIds.includes(tab.id) }"
      >
        <button
          type="button"
          class="editor-tab-title"
          :aria-label="`${tab.title}${splitIds.includes(tab.id) ? ', shown in split' : ''}`"
          :aria-pressed="tab.id === activeId"
          @click="emit('activate', tab.id)"
        >{{ tab.title }}</button>
        <button
          type="button"
          class="editor-tab-close"
          :aria-label="`Close ${tab.title}`"
          @click="closeTab(tab.id, index, $event)"
        ><i class="pi pi-times" aria-hidden="true" /></button>
      </div>
    </div>
    <div role="group" aria-label="Split editor" class="editor-split-controls">
      <TooltipButton
        class="editor-split-button"
        icon="pi pi-columns-2"
        aria-label="Split editor vertically"
        tooltip="Split editor vertically"
        :pressed="splitOrientation === 'vertical'"
        :disabled="tabs.length < 2"
        @click="emit('split', 'vertical')"
      />
      <TooltipButton
        class="editor-split-button"
        icon="pi pi-rows-2"
        aria-label="Split editor horizontally"
        tooltip="Split editor horizontally"
        :pressed="splitOrientation === 'horizontal'"
        :disabled="tabs.length < 2"
        @click="emit('split', 'horizontal')"
      />
      <TooltipButton
        class="editor-split-button"
        icon="pi pi-times"
        aria-label="Exit split view"
        tooltip="Exit split view"
        placement="end"
        :disabled="splitOrientation === null"
        @click="emit('exitSplit')"
      />
    </div>
  </div>
</template>
