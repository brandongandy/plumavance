<script setup lang="ts">
import { computed, ref } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import DocumentNotes from './DocumentNotes.vue'
import SnapshotList from './SnapshotList.vue'
import type { SnapshotOpenRequest } from './snapshotPane.js'

const props = defineProps<{ documentId: string | null }>()
const emit = defineEmits<{ openSnapshot: [request: SnapshotOpenRequest] }>()
const documents = useDocumentStore()
const session = computed(() => documents.sessionFor(props.documentId ?? ''))
const activeTab = ref<'notes' | 'snapshots'>('notes')
</script>

<template>
  <aside aria-label="Inspector" class="workspace-inspector-content">
    <div role="tablist" aria-label="Inspector sections">
      <button
        id="notes-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'notes'"
        aria-controls="notes-panel"
        @click="activeTab = 'notes'"
      >
        Notes
      </button>
      <button
        id="snapshots-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'snapshots'"
        aria-controls="snapshots-panel"
        @click="activeTab = 'snapshots'"
      >
        Snapshots
      </button>
    </div>
    <div v-if="activeTab === 'notes'" id="notes-panel" role="tabpanel" aria-labelledby="notes-tab" class="inspector-panel">
      <DocumentNotes
        v-if="documentId && session?.savedBuffer"
        :model-value="session.notesText"
        @update:model-value="documents.setNotes(documentId, $event)"
      />
      <p v-else>No document selected.</p>
    </div>
    <div v-else id="snapshots-panel" role="tabpanel" aria-labelledby="snapshots-tab" class="inspector-panel">
      <SnapshotList
        v-if="documentId && session?.savedBuffer"
        :document-id="documentId"
        @open-snapshot="emit('openSnapshot', $event)"
      />
      <p v-else>No document selected.</p>
    </div>
  </aside>
</template>
