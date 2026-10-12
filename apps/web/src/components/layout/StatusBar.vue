<script setup lang="ts">
import type { SaveState } from '../../stores/document.js'
import WritingProgressControl from './WritingProgressControl.vue'

defineProps<{
  itemTitle: string | undefined
  saveState: SaveState
  words: number
  characters: number
  projectWords?: number
}>()
</script>

<template>
  <footer class="workspace-status-bar flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-chrome)] px-3 text-[0.6875rem] text-[var(--color-muted)]">
    <span class="workspace-status-title">{{ itemTitle || 'No selection' }}</span>
    <WritingProgressControl :project-words="projectWords ?? 0" />
    <span class="ml-auto font-mono">{{ words }} words · {{ characters }} characters</span>
    <span class="ml-4 font-mono">{{ saveState === 'saving' ? 'Saving…' : saveState[0]?.toUpperCase() + saveState.slice(1) }}</span>
  </footer>
</template>
