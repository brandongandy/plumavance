<script setup lang="ts">
import type { BinderItemDto } from '@scr/shared'

defineProps<{ items: BinderItemDto[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(id: string, checked: boolean, current: string[]): void {
  emit('update:modelValue', checked ? [...current, id] : current.filter((value) => value !== id))
}

function level(item: BinderItemDto, items: BinderItemDto[]): number {
  let result = 0
  let parentId = item.parentId
  while (parentId) {
    result += 1
    parentId = items.find((candidate) => candidate.id === parentId)?.parentId ?? null
  }
  return result
}
</script>

<template>
  <fieldset class="compile-selection">
    <legend>Contents</legend>
    <label v-for="item in items" :key="item.id" :style="{ paddingLeft: `${8 + level(item, items) * 16}px` }">
      <input
        type="checkbox"
        :value="item.id"
        :checked="modelValue.includes(item.id)"
        @change="toggle(item.id, ($event.target as HTMLInputElement).checked, modelValue)"
      />
      <i :class="item.kind === 'folder' ? 'pi pi-folder' : 'pi pi-file'" aria-hidden="true" />
      <span>{{ item.title }}</span>
    </label>
  </fieldset>
</template>
