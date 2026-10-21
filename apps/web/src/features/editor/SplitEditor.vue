<script setup lang="ts">
import { computed, provide } from 'vue'

import type { SplitOrientation } from '../../stores/workspace.js'
import DocumentPane, { unmountedPaneSavedKey } from './DocumentPane.vue'
import SplitDivider from './SplitDivider.vue'

const props = defineProps<{
  documentIds: readonly string[]
  focusedId: string | null
  orientation: SplitOrientation | null
  ratio: number
  focusMode?: boolean
  singlePane?: boolean
}>()
const emit = defineEmits<{
  focus: [id: string]
  saved: [id: string, title: string]
  wordCountDelta: [delta: number]
  resize: [ratio: number]
}>()

provide(unmountedPaneSavedKey, (id, title) => emit('saved', id, title))

const participants = computed(() => [...new Set(props.documentIds)].slice(0, 2))
const visibleIds = computed(() => {
  if (!props.singlePane && props.orientation) return participants.value
  const id = participants.value.find((id) => id === props.focusedId) ?? participants.value[0]
  return id ? [id] : []
})
const isSplit = computed(() => visibleIds.value.length === 2 && props.orientation !== null)
const layoutStyle = computed(() => {
  if (!isSplit.value) return undefined
  const ratio = Number.isFinite(props.ratio) ? Math.min(0.8, Math.max(0.2, props.ratio)) : 0.5
  const tracks = `${ratio}fr 1px ${1 - ratio}fr`
  return props.orientation === 'vertical'
    ? { gridTemplateColumns: tracks, gridTemplateRows: 'minmax(0, 1fr)' }
    : { gridTemplateRows: tracks, gridTemplateColumns: 'minmax(0, 1fr)' }
})
</script>

<template>
  <div class="split-editor" :class="{ 'is-split': isSplit }" :style="layoutStyle">
    <template v-for="(documentId, index) in visibleIds" :key="documentId">
      <DocumentPane
        :document-id="documentId"
        :focused="documentId === focusedId"
        :focus-mode="focusMode"
        @focus="emit('focus', $event)"
        @saved="(id, title) => emit('saved', id, title)"
        @word-count-delta="emit('wordCountDelta', $event)"
      />
      <SplitDivider
        v-if="isSplit && index === 0 && orientation"
        :orientation="orientation"
        :value="ratio"
        @resize="emit('resize', $event)"
      />
    </template>
  </div>
</template>
