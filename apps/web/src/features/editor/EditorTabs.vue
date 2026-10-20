<script setup lang="ts">
import { nextTick, ref } from 'vue'

defineProps<{
  tabs: { id: string; title: string }[]
  activeId: string | null
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string, closeOthers: boolean]
}>()

const tabStrip = ref<HTMLElement | null>(null)

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
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      data-editor-tab
      :data-tab-id="tab.id"
      class="editor-tab"
      :class="{ 'is-active': tab.id === activeId }"
    >
      <button
        type="button"
        class="editor-tab-title"
        :aria-label="tab.title"
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
</template>
