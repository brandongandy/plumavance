<script setup lang="ts">
import type { EditorDocument } from '@scr/shared'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, watch } from 'vue'

import { documentExtensions } from './documentExtensions.js'
import EditorToolbar from './EditorToolbar.vue'

const props = defineProps<{ modelValue: EditorDocument; readonly?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: EditorDocument]
  save: []
}>()

const editor = useEditor({
  content: props.modelValue,
  editable: !props.readonly,
  extensions: documentExtensions(),
  editorProps: {
    attributes: {
      'aria-label': 'Document editor',
      'aria-multiline': 'true',
      class: 'document-prose',
    },
  },
  onUpdate: ({ editor: currentEditor }) => {
    emit('update:modelValue', currentEditor.getJSON() as EditorDocument)
  },
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value || JSON.stringify(editor.value.getJSON()) === JSON.stringify(value)) return
    editor.value.commands.setContent(value, { emitUpdate: false })
  },
  { deep: true },
)

watch(
  () => props.readonly,
  (readonly) => editor.value?.setEditable(!readonly),
)

function handleKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 's') {
    event.preventDefault()
    emit('save')
  }
}

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div data-document-editor class="document-editor" @keydown="handleKeydown">
    <EditorToolbar :editor="editor ?? null" />
    <div class="document-scroll">
      <EditorContent v-if="editor" :editor="editor!" />
    </div>
  </div>
</template>
