<script setup lang="ts">
import { computed } from 'vue'

import TooltipButton from '../../components/controls/TooltipButton.vue'
import DocumentEditor from '../editor/DocumentEditor.vue'
import { buildSnapshotDiff } from './snapshotDiff.js'
import type { SnapshotPaneState } from './snapshotPane.js'

const props = defineProps<{
  view: SnapshotPaneState
}>()
const emit = defineEmits<{ close: [] }>()

const title = computed(() => props.view.summary.name || 'Untitled snapshot')
const modeLabel = computed(() => props.view.mode === 'preview' ? 'Preview' : 'Compare')
const paneLabel = computed(() => `${title.value} snapshot ${props.view.mode === 'preview' ? 'preview' : 'comparison'}`)
const editorLabel = computed(() => `${title.value} snapshot editor`)
const createdLabel = computed(() => new Date(props.view.summary.createdAt).toLocaleString())
const parts = computed(() => props.view.detail
  ? buildSnapshotDiff(props.view.currentText, props.view.detail.contentText)
  : [])
</script>

<template>
  <section
    data-snapshot-pane
    class="snapshot-pane"
    :aria-label="paneLabel"
    :aria-busy="view.loading || undefined"
  >
    <header class="snapshot-pane-header">
      <div class="snapshot-pane-heading">
        <strong>{{ title }}</strong>
        <span>{{ modeLabel }} · {{ createdLabel }}</span>
      </div>
      <TooltipButton
        icon="pi pi-times"
        aria-label="Close snapshot pane"
        tooltip="Close snapshot pane"
        placement="end"
        @click="emit('close')"
      />
    </header>
    <p v-if="view.loading" role="status" class="snapshot-pane-message">Loading snapshot…</p>
    <p v-else-if="view.error" role="alert" class="snapshot-pane-message">{{ view.error }}</p>
    <DocumentEditor
      v-else-if="view.mode === 'preview' && view.detail"
      :model-value="view.detail.contentJson"
      :aria-label="editorLabel"
      readonly
      :toolbar="false"
    />
    <div
      v-else-if="view.detail"
      role="document"
      tabindex="0"
      aria-label="Snapshot comparison"
      class="snapshot-pane-comparison"
    >
      <template v-for="(part, index) in parts" :key="index">
        <ins v-if="part.kind === 'added'"><span class="sr-only">Added: </span>{{ part.text }}</ins>
        <del v-else-if="part.kind === 'removed'"><span class="sr-only">Removed: </span>{{ part.text }}</del>
        <span v-else>{{ part.text }}</span>
      </template>
    </div>
  </section>
</template>

<style scoped>
.snapshot-pane {
  display: flex;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-editor);
}

.snapshot-pane-header {
  display: flex;
  min-height: 43px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-chrome);
  padding: 5px 7px 5px 12px;
}

.snapshot-pane-heading {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.snapshot-pane-heading strong,
.snapshot-pane-heading span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-pane-heading strong {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.snapshot-pane-heading span {
  color: var(--color-muted);
  font-size: 10px;
}

.snapshot-pane-message {
  margin: 0;
  overflow: auto;
  padding: 12px;
  color: var(--color-muted);
  font-size: 12px;
}

.snapshot-pane-comparison {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 30px clamp(20px, 6vw, 72px);
  white-space: pre-wrap;
  color: var(--color-text-soft);
  font-family: var(--font-editor);
  font-size: 16px;
  line-height: 1.6;
}

.snapshot-pane-comparison ins {
  background: color-mix(in srgb, var(--color-success) 24%, transparent);
  text-decoration: none;
}

.snapshot-pane-comparison del {
  background: color-mix(in srgb, var(--color-danger) 20%, transparent);
}
</style>
