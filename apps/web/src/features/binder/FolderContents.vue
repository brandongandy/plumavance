<script setup lang="ts">
import type { BinderItemDto } from '@pluma/shared'

defineProps<{ folder: BinderItemDto; items: BinderItemDto[] }>()
const emit = defineEmits<{ open: [item: BinderItemDto] }>()
</script>

<template>
  <div class="folder-contents" :aria-label="`Contents of ${folder.title}`">
    <header><h1>{{ folder.title }}</h1></header>
    <p v-if="items.length === 0" class="folder-empty">No items</p>
    <button v-for="item in items" v-else :key="item.id" type="button" @click="emit('open', item)">
      <i :class="item.kind === 'folder' ? 'pi pi-folder' : 'pi pi-file'" aria-hidden="true" />
      <span>{{ item.title }}</span>
    </button>
  </div>
</template>
