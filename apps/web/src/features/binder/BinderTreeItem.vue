<script setup lang="ts">
import type { BinderItemDto } from '@scr/shared'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  item: BinderItemDto
  level: number
  selected: boolean
  focused: boolean
  expanded?: boolean
  hasChildren: boolean
  editing: boolean
}>()
const emit = defineEmits<{
  select: [item: BinderItemDto]
  keydown: [event: KeyboardEvent, item: BinderItemDto]
  rename: [item: BinderItemDto, title: string]
  cancelRename: []
  dragStart: [event: DragEvent, item: BinderItemDto]
  drop: [event: DragEvent, item: BinderItemDto]
}>()

const title = ref(props.item.title)
const renameInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return
    title.value = props.item.title
    await nextTick()
    renameInput.value?.select()
  },
  { immediate: true },
)

function submitRename(): void {
  const value = title.value.trim()
  if (value && value !== props.item.title) emit('rename', props.item, value)
  else emit('cancelRename')
}
</script>

<template>
  <div
    role="treeitem"
    :aria-label="`${item.title}, ${item.kind}`"
    :aria-level="level"
    :aria-selected="selected"
    :aria-expanded="item.kind === 'folder' ? expanded : undefined"
    :tabindex="focused ? 0 : -1"
    :data-item-id="item.id"
    class="binder-tree-row"
    :class="{ 'is-selected': selected }"
    draggable="true"
    @click="emit('select', item)"
    @keydown="emit('keydown', $event, item)"
    @dragstart="emit('dragStart', $event, item)"
    @dragover.prevent
    @drop="emit('drop', $event, item)"
  >
    <i
      aria-hidden="true"
      :class="item.kind === 'folder' ? (expanded ? 'pi pi-folder-open' : 'pi pi-folder') : 'pi pi-file'"
    />
    <input
      v-if="editing"
      ref="renameInput"
      v-model="title"
      :aria-label="`Rename ${item.title}`"
      class="binder-rename-input"
      @click.stop
      @keydown.enter.stop.prevent="submitRename"
      @keydown.escape.stop.prevent="emit('cancelRename')"
      @blur="submitRename"
    />
    <span v-else class="truncate">{{ item.title }}</span>
  </div>
</template>
