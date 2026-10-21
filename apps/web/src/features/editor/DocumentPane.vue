<script lang="ts">
import type { InjectionKey } from 'vue'

export const unmountedPaneSavedKey: InjectionKey<(id: string, title: string) => void> = Symbol('unmountedPaneSaved')
</script>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, watch } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import DocumentEditor from './DocumentEditor.vue'
import DocumentHeader from './DocumentHeader.vue'
import SaveStatus from './SaveStatus.vue'

const props = defineProps<{ documentId: string; focused: boolean; focusMode?: boolean }>()
const emit = defineEmits<{
  focus: [id: string]
  saved: [id: string, title: string]
  wordCountDelta: [delta: number]
}>()
const documents = useDocumentStore()
const session = computed(() => documents.sessionFor(props.documentId))
const reportUnmountedSave = inject(unmountedPaneSavedKey, null)
let unmounted = false
onBeforeUnmount(() => { unmounted = true })

watch(() => props.documentId, (id) => {
  const current = documents.sessionFor(id)
  if (!current?.savedBuffer && !current?.loading) void documents.load(id)
}, { immediate: true })

async function saveDocument(): Promise<void> {
  const id = props.documentId
  if (await documents.save(id)) notifySaved(id)
}

async function keepMine(): Promise<void> {
  const id = props.documentId
  if (await documents.keepMine(id)) notifySaved(id)
}

async function reloadServerCopy(): Promise<void> {
  const id = props.documentId
  if (await documents.reloadServerCopy(id)) notifySaved(id)
}

function notifySaved(id: string): void {
  const current = documents.sessionFor(id)
  if (!current) return
  // Vue ignores component emits after unmount; the host outlives displaced panes.
  if (unmounted) reportUnmountedSave?.(id, current.title)
  else emit('saved', id, current.title)
}
</script>

<template>
  <section
    :data-document-pane="documentId"
    class="editor-document-pane"
    :class="{ 'is-focused': focused }"
    :aria-label="`${session?.title || 'Document'} pane`"
    :aria-busy="session?.loading || undefined"
    @focusin="emit('focus', documentId)"
  >
    <p v-if="session?.loading" role="status" class="workspace-message">Opening document…</p>
    <template v-else-if="session?.savedBuffer">
      <DocumentHeader :model-value="session.title" @update:model-value="documents.setTitle(documentId, $event)" />
      <SaveStatus
        :state="session.saveState"
        :message="session.errorMessage"
        @retry="saveDocument"
        @reload="reloadServerCopy"
        @keep-mine="keepMine"
      />
      <DocumentEditor
        :model-value="session.contentJson"
        :aria-label="`${session.title} document editor`"
        :focus-mode="focusMode"
        :scroll-top="session.scrollTop"
        @update:model-value="documents.setContent(documentId, $event)"
        @update:scroll-top="documents.setScrollTop(documentId, $event)"
        @save="saveDocument"
        @word-count-delta="emit('wordCountDelta', $event)"
      />
    </template>
    <div v-else role="alert" class="workspace-message">
      <span>{{ session?.errorMessage || 'The document could not be opened.' }}</span>
      <button type="button" @click="documents.load(documentId, true)">Retry</button>
    </div>
  </section>
</template>
