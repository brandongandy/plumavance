<script setup lang="ts">
import type { CompileExportType, CompileFormat, EreaderFont, PaperbackPageSize } from '@pluma/shared'
import InputText from 'primevue/inputtext'
import { computed, watch } from 'vue'

const exportType = defineModel<CompileExportType>('exportType', { required: true })
const format = defineModel<CompileFormat>('format', { required: true })
const font = defineModel<EreaderFont>('font', { required: true })
const pageSize = defineModel<PaperbackPageSize>('pageSize', { required: true })
const includeTitles = defineModel<boolean>('includeTitles', { required: true })
const includeFolderTitles = defineModel<boolean>('includeFolderTitles', { required: true })
const sceneSeparator = defineModel<string>('sceneSeparator', { required: true })
const chapterPageBreaks = defineModel<boolean>('chapterPageBreaks', { required: true })
const filename = defineModel<string>('filename', { required: true })

const paperbackPageSizeOptions: { label: string; value: PaperbackPageSize }[] = [
  { label: 'Mass-market paperback — 4.25″ × 6.87″', value: 'mass-market' },
  { label: 'Digest — 5.06″ × 7.81″', value: 'digest' },
  { label: 'Trade — 6″ × 9″', value: 'trade' },
]

const formatOptions = computed<{ label: string; value: CompileFormat }[]>(() => exportType.value === 'manuscript'
  ? [
      { label: 'PDF', value: 'pdf' },
      { label: 'RTF', value: 'rtf' },
      { label: 'Markdown', value: 'markdown' },
    ]
  : [
      { label: 'PDF', value: 'pdf' },
      { label: 'EPUB', value: 'epub' },
    ])

watch(exportType, () => {
  if (!formatOptions.value.some((option) => option.value === format.value)) format.value = 'pdf'
})
</script>

<template>
  <div class="compile-options">
    <fieldset>
      <legend>Export type</legend>
      <label><input v-model="exportType" type="radio" name="compile-export-type" value="manuscript" /> Manuscript</label>
      <label><input v-model="exportType" type="radio" name="compile-export-type" value="ereader" /> E-reader</label>
    </fieldset>
    <fieldset>
      <legend>Format</legend>
      <label v-for="option in formatOptions" :key="option.value"><input v-model="format" type="radio" name="compile-format" :value="option.value" /> {{ option.label }}</label>
    </fieldset>
    <fieldset v-if="exportType === 'ereader'" aria-label="E-reader font">
      <legend>Font</legend>
      <label><input v-model="font" type="radio" name="compile-font" value="serif" /> Literata (serif)</label>
      <label><input v-model="font" type="radio" name="compile-font" value="sans-serif" /> IBM Plex Sans</label>
      <label><input v-model="font" type="radio" name="compile-font" value="monospace" /> IBM Plex Mono</label>
    </fieldset>
    <label v-if="exportType === 'ereader' && format === 'pdf'" class="paperback-size-field">
      <span>Paperback size</span>
      <select v-model="pageSize" aria-label="Paperback size">
        <option v-for="option in paperbackPageSizeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <label><input v-model="includeTitles" type="checkbox" /> Include scene titles</label>
    <label><input v-model="includeFolderTitles" type="checkbox" /> Include chapter titles</label>
    <label><input v-model="chapterPageBreaks" type="checkbox" aria-label="Chapter page breaks" /> Start chapters on new pages</label>
    <label class="dialog-field"><span>Scene separator</span><InputText v-model="sceneSeparator" aria-label="Scene separator" maxlength="20" /></label>
    <label class="dialog-field"><span>Filename</span><InputText v-model="filename" aria-label="Export filename" maxlength="200" /></label>
  </div>
</template>
