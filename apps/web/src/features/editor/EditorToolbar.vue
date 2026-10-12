<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import Button from 'primevue/button'

defineProps<{ editor: Editor | null }>()
</script>

<template>
  <div v-if="editor" role="toolbar" aria-label="Text formatting" class="editor-toolbar">
    <Button
      icon="pi pi-undo"
      text
      aria-label="Undo"
      :disabled="!editor.can().chain().focus().undo().run()"
      @click="editor.chain().focus().undo().run()"
    />
    <Button
      icon="pi pi-redo"
      text
      aria-label="Redo"
      :disabled="!editor.can().chain().focus().redo().run()"
      @click="editor.chain().focus().redo().run()"
    />
    <span aria-hidden="true" class="editor-toolbar-divider" />
    <Button
      label="P"
      text
      aria-label="Paragraph"
      :aria-pressed="editor.isActive('paragraph')"
      @click="editor.chain().focus().setParagraph().run()"
    />
    <Button
      label="H1"
      text
      aria-label="Heading 1"
      :aria-pressed="editor.isActive('heading', { level: 1 })"
      @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
    />
    <Button
      label="H2"
      text
      aria-label="Heading 2"
      :aria-pressed="editor.isActive('heading', { level: 2 })"
      @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
    />
    <span aria-hidden="true" class="editor-toolbar-divider" />
    <Button
      label="B"
      text
      aria-label="Bold"
      :aria-pressed="editor.isActive('bold')"
      class="font-bold"
      @click="editor.chain().focus().toggleBold().run()"
    />
    <Button
      label="I"
      text
      aria-label="Italic"
      :aria-pressed="editor.isActive('italic')"
      class="italic"
      @click="editor.chain().focus().toggleItalic().run()"
    />
    <Button
      label="U"
      text
      aria-label="Underline"
      :aria-pressed="editor.isActive('underline')"
      class="underline"
      @click="editor.chain().focus().toggleUnderline().run()"
    />
    <Button
      label="S"
      text
      aria-label="Strikethrough"
      :aria-pressed="editor.isActive('strike')"
      class="line-through"
      @click="editor.chain().focus().toggleStrike().run()"
    />
    <span aria-hidden="true" class="editor-toolbar-divider" />
    <Button
      icon="pi pi-list"
      text
      aria-label="Bullet list"
      :aria-pressed="editor.isActive('bulletList')"
      @click="editor.chain().focus().toggleBulletList().run()"
    />
    <Button
      icon="pi pi-list-check"
      text
      aria-label="Numbered list"
      :aria-pressed="editor.isActive('orderedList')"
      @click="editor.chain().focus().toggleOrderedList().run()"
    />
    <Button
      icon="pi pi-indent"
      text
      aria-label="Indent"
      :disabled="!editor.can().chain().focus().sinkListItem('listItem').run()"
      @click="editor.chain().focus().sinkListItem('listItem').run()"
    />
    <Button
      icon="pi pi-outdent"
      text
      aria-label="Outdent"
      :disabled="!editor.can().chain().focus().liftListItem('listItem').run()"
      @click="editor.chain().focus().liftListItem('listItem').run()"
    />
    <Button
      icon="pi pi-block-quote"
      text
      aria-label="Block quote"
      :aria-pressed="editor.isActive('blockquote')"
      @click="editor.chain().focus().toggleBlockquote().run()"
    />
    <Button
      label="—"
      text
      aria-label="Horizontal rule"
      @click="editor.chain().focus().setHorizontalRule().run()"
    />
  </div>
</template>
