<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

import TooltipButton from '../../components/controls/TooltipButton.vue'
import { provideTooltipGroup } from '../../components/controls/tooltipGroup.js'
import { shortcutLabel } from '../../components/controls/shortcutLabels.js'
import type { SaveState } from '../../stores/document.js'
import SaveStatus from './SaveStatus.vue'

defineProps<{ editor: Editor | null; saveState: SaveState; saveMessage?: string | undefined }>()
const emit = defineEmits<{ save: []; reload: []; keepMine: [] }>()
provideTooltipGroup()
</script>

<template>
  <div v-if="editor" role="toolbar" aria-label="Document toolbar" class="editor-toolbar">
    <div class="editor-formatting-controls">
      <TooltipButton
        icon="pi pi-undo"
        aria-label="Undo"
        :tooltip="`Undo (${shortcutLabel('Mod+Z')})`"
        :disabled="!editor.can().chain().focus().undo().run()"
        placement="start"
        @click="editor.chain().focus().undo().run()"
      />
      <TooltipButton
        icon="pi pi-undo editor-redo-icon"
        aria-label="Redo"
        :tooltip="`Redo (${shortcutLabel('Mod+Shift+Z', 'Mod+Y')})`"
        :disabled="!editor.can().chain().focus().redo().run()"
        @click="editor.chain().focus().redo().run()"
      />
      <span aria-hidden="true" class="editor-toolbar-divider" />
      <TooltipButton
        label="P"
        aria-label="Paragraph"
        :tooltip="`Paragraph (${shortcutLabel('Mod+Alt+0')})`"
        :pressed="editor.isActive('paragraph')"
        @click="editor.chain().focus().setParagraph().run()"
      />
      <TooltipButton
        label="H1"
        aria-label="Heading 1"
        :tooltip="`Heading 1 (${shortcutLabel('Mod+Alt+1')})`"
        :pressed="editor.isActive('heading', { level: 1 })"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      />
      <TooltipButton
        label="H2"
        aria-label="Heading 2"
        :tooltip="`Heading 2 (${shortcutLabel('Mod+Alt+2')})`"
        :pressed="editor.isActive('heading', { level: 2 })"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      />
      <span aria-hidden="true" class="editor-toolbar-divider" />
      <TooltipButton
        label="B"
        aria-label="Bold"
        :tooltip="`Bold (${shortcutLabel('Mod+B')})`"
        :pressed="editor.isActive('bold')"
        class="font-bold"
        @click="editor.chain().focus().toggleBold().run()"
      />
      <TooltipButton
        label="I"
        aria-label="Italic"
        :tooltip="`Italic (${shortcutLabel('Mod+I')})`"
        :pressed="editor.isActive('italic')"
        class="italic"
        @click="editor.chain().focus().toggleItalic().run()"
      />
      <TooltipButton
        label="U"
        aria-label="Underline"
        :tooltip="`Underline (${shortcutLabel('Mod+U')})`"
        :pressed="editor.isActive('underline')"
        class="underline"
        @click="editor.chain().focus().toggleUnderline().run()"
      />
      <TooltipButton
        label="S"
        aria-label="Strikethrough"
        :tooltip="`Strikethrough (${shortcutLabel('Mod+Shift+S')})`"
        :pressed="editor.isActive('strike')"
        class="line-through"
        @click="editor.chain().focus().toggleStrike().run()"
      />
      <span aria-hidden="true" class="editor-toolbar-divider" />
      <TooltipButton
        icon="pi pi-list"
        aria-label="Bullet list"
        :tooltip="`Bullet list (${shortcutLabel('Mod+Shift+8')})`"
        :pressed="editor.isActive('bulletList')"
        @click="editor.chain().focus().toggleBulletList().run()"
      />
      <TooltipButton
        icon="pi pi-list-check"
        aria-label="Numbered list"
        :tooltip="`Numbered list (${shortcutLabel('Mod+Shift+7')})`"
        :pressed="editor.isActive('orderedList')"
        @click="editor.chain().focus().toggleOrderedList().run()"
      />
      <TooltipButton
        icon="pi pi-indent"
        aria-label="Indent"
        tooltip="Indent (Tab)"
        :disabled="!editor.can().chain().focus().sinkListItem('listItem').run()"
        @click="editor.chain().focus().sinkListItem('listItem').run()"
      />
      <TooltipButton
        icon="pi pi-outdent"
        aria-label="Outdent"
        tooltip="Outdent (Shift+Tab)"
        :disabled="!editor.can().chain().focus().liftListItem('listItem').run()"
        @click="editor.chain().focus().liftListItem('listItem').run()"
      />
      <TooltipButton
        icon="pi pi-block-quote"
        aria-label="Block quote"
        :tooltip="`Block quote (${shortcutLabel('Mod+Shift+B')})`"
        :pressed="editor.isActive('blockquote')"
        @click="editor.chain().focus().toggleBlockquote().run()"
      />
      <TooltipButton
        label="—"
        aria-label="Horizontal rule"
        tooltip="Horizontal rule"
        placement="end"
        @click="editor.chain().focus().setHorizontalRule().run()"
      />
    </div>
    <span aria-hidden="true" class="editor-toolbar-divider" />
    <SaveStatus
      :state="saveState"
      :message="saveMessage"
      @save="emit('save')"
      @reload="emit('reload')"
      @keep-mine="emit('keepMine')"
    />
  </div>
</template>
