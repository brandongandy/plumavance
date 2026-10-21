<script setup lang="ts">
import { computed, provide } from 'vue'

import SnapshotPane from '../inspector/SnapshotPane.vue'
import type { SnapshotPaneState } from '../inspector/snapshotPane.js'
import type { SplitOrientation } from '../../stores/workspace.js'
import DocumentPane, { unmountedPaneSavedKey } from './DocumentPane.vue'
import SplitDivider from './SplitDivider.vue'

type VisiblePane =
  | { key: string; kind: 'document'; documentId: string }
  | { key: 'snapshot'; kind: 'snapshot' }

const props = defineProps<{
  documentIds: readonly string[]
  focusedId: string | null
  orientation: SplitOrientation | null
  ratio: number
  focusMode?: boolean
  singlePane?: boolean
  snapshot?: SnapshotPaneState | null
}>()
const emit = defineEmits<{
  focus: [id: string]
  saved: [id: string, title: string]
  wordCountDelta: [delta: number]
  resize: [ratio: number]
  closeSnapshot: []
}>()

provide(unmountedPaneSavedKey, (id, title) => emit('saved', id, title))

const participants = computed(() => [...new Set(props.documentIds)].slice(0, 2))
const visibleIds = computed(() => {
  if (!props.singlePane && props.orientation) return participants.value
  const id = participants.value.find((id) => id === props.focusedId) ?? participants.value[0]
  return id ? [id] : []
})
const snapshotDocumentId = computed(() =>
  participants.value.find((id) => id === props.focusedId) ?? participants.value[0] ?? null,
)
const visiblePanes = computed<VisiblePane[]>(() => {
  if (!props.snapshot) {
    return visibleIds.value.map((documentId) => ({ key: documentId, kind: 'document', documentId }))
  }
  if (props.singlePane) return [{ key: 'snapshot', kind: 'snapshot' }]
  const documentId = snapshotDocumentId.value
  if (!documentId) return [{ key: 'snapshot', kind: 'snapshot' }]
  const documentPane: VisiblePane = { key: documentId, kind: 'document', documentId }
  const snapshotPane: VisiblePane = { key: 'snapshot', kind: 'snapshot' }
  return participants.value.indexOf(documentId) === 1
    ? [snapshotPane, documentPane]
    : [documentPane, snapshotPane]
})
const isSplit = computed(() => visiblePanes.value.length === 2 && props.orientation !== null)
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
    <template v-for="(pane, index) in visiblePanes" :key="pane.key">
      <DocumentPane
        v-if="pane.kind === 'document'"
        :document-id="pane.documentId"
        :focused="pane.documentId === focusedId"
        :focus-mode="focusMode"
        @focus="emit('focus', $event)"
        @saved="(id, title) => emit('saved', id, title)"
        @word-count-delta="emit('wordCountDelta', $event)"
      />
      <SnapshotPane
        v-else-if="snapshot"
        :view="snapshot"
        @close="emit('closeSnapshot')"
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
