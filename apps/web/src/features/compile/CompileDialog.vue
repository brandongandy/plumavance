<script setup lang="ts">
import type { CompileFormat, CompileRequest } from '@scr/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { computed, ref, watch } from 'vue'

import { useWorkspaceStore } from '../../stores/workspace.js'
import CompileOrder from './CompileOrder.vue'
import CompileSelectionTree from './CompileSelectionTree.vue'

const props = withDefaults(defineProps<{ visible: boolean; dirty: boolean; busy?: boolean; error?: string }>(), { busy: false, error: '' })
const emit = defineEmits<{ close: []; save: []; compile: [request: CompileRequest] }>()
const store = useWorkspaceStore()
const selectedIds = ref<string[]>([])
const format = ref<CompileFormat>('pdf')
const includeTitles = ref(true)
const separateDocuments = ref(true)
const filename = ref(store.project?.name ?? 'Manuscript')
const gateResolved = ref(!props.dirty)

watch(() => props.visible, (visible) => {
  if (!visible) return
  gateResolved.value = !props.dirty
  selectedIds.value = []
  filename.value = store.project?.name ?? 'Manuscript'
})
watch(() => props.dirty, (dirty) => {
  if (!dirty) gateResolved.value = true
})

const orderedDocuments = computed(() => {
  const selected = new Set(selectedIds.value)
  const folders = store.items.filter((item) => item.kind === 'folder' && selected.has(item.id))
  return store.items.filter((item) => {
    if (item.kind !== 'document') return false
    if (selected.has(item.id)) return true
    let parentId = item.parentId
    while (parentId) {
      if (folders.some((folder) => folder.id === parentId)) return true
      parentId = store.items.find((candidate) => candidate.id === parentId)?.parentId ?? null
    }
    return false
  })
})

function submit(): void {
  if (!filename.value.trim() || orderedDocuments.value.length === 0) return
  emit('compile', {
    itemIds: selectedIds.value,
    format: format.value,
    includeTitles: includeTitles.value,
    separateDocuments: separateDocuments.value,
    filename: filename.value.trim(),
  })
}
</script>

<template>
  <Dialog :visible="visible" modal header="Compile" :draggable="false" class="scr-dialog compile-dialog" @update:visible="!$event && emit('close')">
    <div v-if="dirty && !gateResolved" class="compile-dirty-gate">
      <p>Save changes before compiling?</p>
      <div>
        <Button label="Cancel" text @click="emit('close')" />
        <Button label="Continue with Saved Copy" text aria-label="Compile saved copy" @click="gateResolved = true" />
        <Button label="Save" aria-label="Save before compile" @click="emit('save')" />
      </div>
    </div>
    <template v-else>
      <div class="compile-grid">
        <CompileSelectionTree v-model="selectedIds" :items="store.items" />
        <CompileOrder :documents="orderedDocuments" />
      </div>
      <div class="compile-options">
        <fieldset><legend>Format</legend><label v-for="value in (['pdf', 'rtf', 'markdown'] as const)" :key="value"><input v-model="format" type="radio" name="compile-format" :value="value" /> {{ value === 'markdown' ? 'Markdown' : value.toUpperCase() }}</label></fieldset>
        <label><input v-model="includeTitles" type="checkbox" /> Include document titles</label>
        <label><input v-model="separateDocuments" type="checkbox" /> {{ format === 'markdown' ? 'Separate documents with a rule' : 'Start documents on new pages' }}</label>
        <label class="dialog-field"><span>Filename</span><InputText v-model="filename" aria-label="Export filename" maxlength="200" /></label>
      </div>
    </template>
    <p v-if="error" role="alert" class="compile-error">{{ error }}</p>
    <p v-if="busy" role="status">Compiling…</p>
    <template #footer>
      <Button label="Cancel" text @click="emit('close')" />
      <Button label="Compile" aria-label="Compile download" :loading="busy" :disabled="!gateResolved || orderedDocuments.length === 0 || !filename.trim()" @click="submit" />
    </template>
  </Dialog>
</template>
