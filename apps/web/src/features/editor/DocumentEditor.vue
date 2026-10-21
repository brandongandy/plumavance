<script setup lang="ts">
import type { EditorDocument } from '@pluma/shared'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useTypewriterScroll } from '../focus/useTypewriterScroll.js'
import { countText, editorText } from './counts.js'
import { documentExtensions } from './documentExtensions.js'
import EditorToolbar from './EditorToolbar.vue'

const props = withDefaults(defineProps<{
  modelValue: EditorDocument
  readonly?: boolean
  focusMode?: boolean
  ariaLabel?: string
  scrollTop?: number
}>(), { ariaLabel: 'Document editor', scrollTop: 0 })
const emit = defineEmits<{
  'update:modelValue': [value: EditorDocument]
  'update:scrollTop': [value: number]
  'word-count-delta': [signedDelta: number]
  save: []
}>()

const editor = useEditor({
  content: props.modelValue,
  editable: !props.readonly,
  extensions: documentExtensions(),
  editorProps: {
    attributes: {
      'aria-label': props.ariaLabel,
      'aria-multiline': 'true',
      class: 'document-prose',
    },
  },
  onUpdate: ({ editor: currentEditor, transaction }) => {
    const before = countText(editorText(transaction.before.toJSON() as EditorDocument)).words
    const after = countText(editorText(transaction.doc.toJSON() as EditorDocument)).words
    const delta = after - before
    if (delta !== 0) emit('word-count-delta', delta)
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

watch(() => props.ariaLabel, (label) => {
  editor.value?.setOptions({
    editorProps: { attributes: { 'aria-label': label, 'aria-multiline': 'true', class: 'document-prose' } },
  })
})

function restoreScroll(): void {
  if (scrollContainer.value) scrollContainer.value.scrollTop = props.scrollTop
}

onMounted(async () => {
  await nextTick()
  // EditorContent transfers the editable DOM on its own next tick after mounting.
  await nextTick()
  restoreScroll()
})
watch(() => props.scrollTop, restoreScroll, { flush: 'post' })

function handleKeydown(event: KeyboardEvent): void {
  if (
    event.defaultPrevented
    || event.repeat
    || event.shiftKey
    || event.altKey
    || (!event.metaKey && !event.ctrlKey)
    || event.key.toLocaleLowerCase() !== 's'
  ) return
  event.preventDefault()
  emit('save')
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
    <div
      ref="scrollContainer"
      class="document-scroll"
      @scroll.passive="emit('update:scrollTop', ($event.target as HTMLElement).scrollTop)"
      @wheel.passive="typewriter.noteManualScroll"
      @pointerdown="typewriter.noteManualScroll"
    >
      <EditorContent v-if="editor" :editor="editor!" />
    </div>
  </div>
</template>
