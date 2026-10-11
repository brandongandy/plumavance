<script setup lang="ts">
import { ref } from 'vue'

import DocumentNotes from './DocumentNotes.vue'

defineProps<{ notes: string; hasDocument: boolean }>()
const emit = defineEmits<{ 'update:notes': [value: string] }>()
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
        v-if="hasDocument"
        :model-value="notes"
        @update:model-value="emit('update:notes', $event)"
      />
      <p v-else>No document selected.</p>
    </div>
    <div v-else id="snapshots-panel" role="tabpanel" aria-labelledby="snapshots-tab" class="inspector-panel">
      <p v-if="hasDocument">No snapshots.</p>
      <p v-else>No document selected.</p>
    </div>
  </aside>
</template>
