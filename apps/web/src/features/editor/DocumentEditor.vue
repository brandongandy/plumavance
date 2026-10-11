<script setup lang="ts">
import type { EditorDocument } from '@scr/shared'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, ref, watch } from 'vue'

import { useTypewriterScroll } from '../focus/useTypewriterScroll.js'
import { documentExtensions } from './documentExtensions.js'
import EditorToolbar from './EditorToolbar.vue'

const props = defineProps<{ modelValue: EditorDocument; readonly?: boolean; focusMode?: boolean }>()
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
const scrollContainer = ref<HTMLElement | null>(null)
const typewriter = useTypewriterScroll(scrollContainer, {
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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

function handleKeyup(event: KeyboardEvent): void {
  if (!props.focusMode || event.metaKey || event.ctrlKey || event.altKey) return
  const node = window.getSelection()?.anchorNode
  const element = node instanceof HTMLElement ? node : node?.parentElement
  const block = element?.closest<HTMLElement>('p, h1, h2, h3, blockquote, li')
  if (block) typewriter.onKeyboardEdit(block)
}

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div data-document-editor class="document-editor" @keydown="handleKeydown" @keyup="handleKeyup">
    <EditorToolbar :editor="editor ?? null" />
    <div ref="scrollContainer" class="document-scroll" @wheel.passive="typewriter.noteManualScroll" @pointerdown="typewriter.noteManualScroll">
      <EditorContent v-if="editor" :editor="editor!" />
    </div>
  </div>
</template>
