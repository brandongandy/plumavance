<script setup lang="ts">
import type { CompileExportType, CompileFormat, CompileRequest, EreaderFont, PaperbackPageSize } from '@pluma/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { computed, ref, shallowRef, watch } from 'vue'

import { useWorkspaceStore } from '../../stores/workspace.js'
import CompileOptions from './CompileOptions.vue'
import CompileOrder from './CompileOrder.vue'
import CompileSelectionTree from './CompileSelectionTree.vue'

const props = withDefaults(defineProps<{ visible: boolean; dirty: boolean; busy?: boolean; error?: string }>(), { busy: false, error: '' })
const emit = defineEmits<{ close: []; save: []; compile: [request: CompileRequest] }>()
const store = useWorkspaceStore()
const selectedIds = ref<string[]>([])
const exportType = shallowRef<CompileExportType>('manuscript')
const format = shallowRef<CompileFormat>('pdf')
const font = shallowRef<EreaderFont>('serif')
const pageSize = shallowRef<PaperbackPageSize>('digest')
const includeTitles = shallowRef(true)
const includeFolderTitles = shallowRef(true)
const sceneSeparator = shallowRef('#')
const chapterPageBreaks = shallowRef(true)
const filename = shallowRef(store.project?.name ?? 'Manuscript')
const gateResolved = shallowRef(!props.dirty)

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
  const common = {
    itemIds: selectedIds.value,
    includeTitles: includeTitles.value,
    includeFolderTitles: includeFolderTitles.value,
    sceneSeparator: sceneSeparator.value,
    chapterPageBreaks: chapterPageBreaks.value,
    filename: filename.value.trim(),
  }
  const request: CompileRequest = exportType.value === 'ereader'
    ? {
        ...common,
        exportType: 'ereader',
        format: format.value === 'epub' ? 'epub' : 'pdf',
        font: font.value,
        ...(format.value === 'pdf' ? { pageSize: pageSize.value } : {}),
      }
    : { ...common, exportType: 'manuscript', format: format.value === 'rtf' || format.value === 'markdown' ? format.value : 'pdf' }
  emit('compile', request)
}
</script>

<template>
  <Dialog :visible="visible" modal header="Compile" :draggable="false" class="pluma-dialog compile-dialog" @update:visible="!$event && emit('close')">
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
      <CompileOptions
        v-model:export-type="exportType"
        v-model:format="format"
        v-model:font="font"
        v-model:page-size="pageSize"
        v-model:include-titles="includeTitles"
        v-model:include-folder-titles="includeFolderTitles"
        v-model:scene-separator="sceneSeparator"
        v-model:chapter-page-breaks="chapterPageBreaks"
        v-model:filename="filename"
      />
    </template>
    <p v-if="error" role="alert" class="compile-error">{{ error }}</p>
    <p v-if="busy" role="status">Compiling…</p>
    <template #footer>
      <Button label="Cancel" text @click="emit('close')" />
      <Button label="Compile" aria-label="Compile download" :loading="busy" :disabled="!gateResolved || orderedDocuments.length === 0 || !filename.trim()" @click="submit" />
    </template>
  </Dialog>
</template>
