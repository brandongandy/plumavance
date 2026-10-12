<script setup lang="ts">
import type { BinderItemDto } from '@pluma/shared'
import Button from 'primevue/button'
import { computed } from 'vue'

const props = defineProps<{ items: BinderItemDto[] }>()
const selectedIds = defineModel<string[]>({ required: true })
const itemsById = computed(() => new Map(props.items.map((item) => [item.id, item])))
const allSelected = computed(() => props.items.length > 0 && props.items.every((item) => selectedIds.value.includes(item.id)))

function isInSubtree(item: BinderItemDto, rootId: string): boolean {
  let current: BinderItemDto | undefined = item
  while (current) {
    if (current.id === rootId) return true
    current = current.parentId ? itemsById.value.get(current.parentId) : undefined
  }
  return false
}

function toggle(id: string, checked: boolean): void {
  const next = new Set(selectedIds.value)
  for (const item of props.items.filter((candidate) => isInSubtree(candidate, id))) {
    if (checked) next.add(item.id)
    else next.delete(item.id)
  }
  if (!checked) {
    let parentId = itemsById.value.get(id)?.parentId
    while (parentId) {
      next.delete(parentId)
      parentId = itemsById.value.get(parentId)?.parentId ?? null
    }
  }
  selectedIds.value = props.items.filter((item) => next.has(item.id)).map((item) => item.id)
}

function toggleAll(): void {
  selectedIds.value = allSelected.value ? [] : props.items.map((item) => item.id)
}

function level(item: BinderItemDto): number {
  let result = 0
  let parentId = item.parentId
  while (parentId) {
    result += 1
    parentId = itemsById.value.get(parentId)?.parentId ?? null
  }
  return result
}
</script>

<template>
  <fieldset class="compile-selection">
    <legend>Contents</legend>
    <Button
      :label="allSelected ? 'Clear all' : 'Select all'"
      :aria-label="allSelected ? 'Clear compile selection' : 'Select all compile items'"
      class="compile-selection-toggle"
      size="small"
      text
      @click="toggleAll"
    />
    <label v-for="item in items" :key="item.id" :style="{ paddingLeft: `${8 + level(item) * 16}px` }">
      <input
        type="checkbox"
        :value="item.id"
        :checked="selectedIds.includes(item.id)"
        @change="toggle(item.id, ($event.target as HTMLInputElement).checked)"
      />
      <i :class="item.kind === 'folder' ? 'pi pi-folder' : 'pi pi-file'" aria-hidden="true" />
      <span>{{ item.title }}</span>
    </label>
  </fieldset>
</template>
