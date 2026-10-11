<script setup lang="ts">
defineProps<{ itemTitle: string | undefined }>()
</script>

<template>
  <footer class="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-chrome)] px-3 text-[0.6875rem] text-[var(--color-muted)]">
    <span>{{ itemTitle || 'No selection' }}</span>
    <span class="font-mono">Saved</span>
  </footer>
</template>
