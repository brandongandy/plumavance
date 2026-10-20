<script setup lang="ts">
import type { BinderItemDto } from '@pluma/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { computed, nextTick, ref, watch } from 'vue'

import { useProvidedUnsavedGuard } from '../../composables/useUnsavedGuard.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import BinderToolbar from './BinderToolbar.vue'
import BinderTreeItem from './BinderTreeItem.vue'
import { useDebouncedSearch } from './useDebouncedSearch.js'
import { createMoveIntent, useBinderMove } from './useBinderMove.js'

const store = useWorkspaceStore()
const unsavedGuard = useProvidedUnsavedGuard()
const expandedIds = ref(new Set(store.items.filter((item) => item.kind === 'folder').map((item) => item.id)))
const focusedId = ref(store.activeItemId ?? store.items[0]?.id ?? '')
const editingId = ref<string | null>(null)
const query = ref('')
const draggedId = ref<string | null>(null)
const pendingDeleteId = ref<string | null>(null)
const dropTarget = ref<{ id: string; position: 'before' | 'inside' | 'after' } | null>(null)
const initializedFromProject = ref(false)
const { moveByPointer, moveByKeyboard } = useBinderMove((intent) => store.moveItem(intent))
useDebouncedSearch(query, (value, signal) => store.search(value, signal))

function childrenOf(parentId: string | null): BinderItemDto[] {
  return store.items
    .filter((item) => item.parentId === parentId)
    .sort((left, right) => left.position - right.position)
}

function isVisible(item: BinderItemDto): boolean {
  let parentId = item.parentId
  while (parentId) {
    if (!expandedIds.value.has(parentId)) return false
    parentId = store.items.find((candidate) => candidate.id === parentId)?.parentId ?? null
  }
  return true
}

const visibleItems = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  const searchIds = new Set(store.searchResults.map((result) => result.id))
  return store.items.filter((item) => {
    if (normalized) return item.title.toLocaleLowerCase().includes(normalized) || searchIds.has(item.id)
    return isVisible(item)
  })
})

function levelOf(item: BinderItemDto): number {
  if (query.value.trim()) return 1
  let level = 1
  let parentId = item.parentId
  while (parentId) {
    level += 1
    parentId = store.items.find((candidate) => candidate.id === parentId)?.parentId ?? null
  }
  return level
}

function hasChildren(item: BinderItemDto): boolean {
  return store.items.some((candidate) => candidate.parentId === item.id)
}

async function focusItem(id: string): Promise<void> {
  focusedId.value = id
  await nextTick()
  document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)?.focus()
}

function selectItem(item: BinderItemDto): void {
  if (store.activeItemId !== item.id && !unsavedGuard.canTransition()) return
  if (item.kind === 'document') store.replaceActiveDocument(item.id)
  else store.activeItemId = item.id
  focusedId.value = item.id
  store.activePanel = 'editor'
}

function openNewTab(item: BinderItemDto): void {
  if (store.activeItemId !== item.id && !unsavedGuard.canTransition()) return
  store.openDocumentInNewTab(item.id)
  focusedId.value = item.id
}

function toggle(item: BinderItemDto, expand?: boolean): void {
  const next = new Set(expandedIds.value)
  const shouldExpand = expand ?? !next.has(item.id)
  if (shouldExpand) next.add(item.id)
  else next.delete(item.id)
  expandedIds.value = next
}

function siblingIndex(item: BinderItemDto): number {
  return childrenOf(item.parentId).findIndex((candidate) => candidate.id === item.id)
}

async function keyboardMove(event: KeyboardEvent, item: BinderItemDto): Promise<boolean> {
  if (!event.altKey) return false
  const siblings = childrenOf(item.parentId)
  const index = siblingIndex(item)
  if (event.key === 'ArrowUp' && index > 0) {
    await moveByKeyboard(item.id, item.parentId, index - 1)
  } else if (event.key === 'ArrowDown' && index < siblings.length - 1) {
    await moveByKeyboard(item.id, item.parentId, index + 1)
  } else if (event.key === 'ArrowRight') {
    const previousFolder = store.items
      .slice(0, store.items.findIndex((candidate) => candidate.id === item.id))
      .toReversed()
      .find((candidate) => candidate.kind === 'folder' && candidate.parentId === item.parentId)
    if (previousFolder) {
      await moveByKeyboard(item.id, previousFolder.id, childrenOf(previousFolder.id).length)
    }
  } else if (event.key === 'ArrowLeft' && item.parentId) {
    const parent = store.items.find((candidate) => candidate.id === item.parentId)
    if (parent) await moveByKeyboard(item.id, parent.parentId, siblingIndex(parent) + 1)
  } else return false
  event.preventDefault()
  return true
}

async function handleKeydown(event: KeyboardEvent, item: BinderItemDto): Promise<void> {
  if (await keyboardMove(event, item)) return
  const index = visibleItems.value.findIndex((candidate) => candidate.id === item.id)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    await focusItem(visibleItems.value[Math.min(index + 1, visibleItems.value.length - 1)]?.id ?? item.id)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    await focusItem(visibleItems.value[Math.max(index - 1, 0)]?.id ?? item.id)
  } else if (event.key === 'Home') {
    event.preventDefault()
    await focusItem(visibleItems.value[0]?.id ?? item.id)
  } else if (event.key === 'End') {
    event.preventDefault()
    await focusItem(visibleItems.value.at(-1)?.id ?? item.id)
  } else if (event.key === 'ArrowRight' && item.kind === 'folder') {
    event.preventDefault()
    if (!expandedIds.value.has(item.id)) toggle(item, true)
    else await focusItem(childrenOf(item.id)[0]?.id ?? item.id)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (item.kind === 'folder' && expandedIds.value.has(item.id)) toggle(item, false)
    else if (item.parentId) await focusItem(item.parentId)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    selectItem(item)
  } else if (event.key === 'F2') {
    event.preventDefault()
    editingId.value = item.id
  } else if (event.key === 'Delete') {
    event.preventDefault()
    if (unsavedGuard.canTransition()) await store.trashItem(item.id)
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLocaleLowerCase()
    const match = [...visibleItems.value.slice(index + 1), ...visibleItems.value.slice(0, index + 1)].find(
      (candidate) => candidate.title.toLocaleLowerCase().startsWith(key),
    )
    if (match) await focusItem(match.id)
  }
}

watch(
  () => store.items,
  (items) => {
    if (initializedFromProject.value || items.length === 0) return
    expandedIds.value = new Set(items.filter((item) => item.kind === 'folder').map((item) => item.id))
    focusedId.value = store.activeItemId ?? items[0]?.id ?? ''
    initializedFromProject.value = true
  },
)

watch(
  () => store.activeItemId,
  (id) => {
    if (id && !store.items.some((item) => item.id === focusedId.value)) focusedId.value = id
  },
)

async function rename(item: BinderItemDto, title: string): Promise<void> {
  editingId.value = null
  await store.renameItem(item.id, title)
  await focusItem(item.id)
}

function parentForNewItem(): string | null {
  const active = store.activeItem
  return active?.kind === 'folder' ? active.id : (active?.parentId ?? null)
}

async function add(kind: 'folder' | 'document'): Promise<void> {
  if (!unsavedGuard.canTransition()) return
  const parentId = parentForNewItem()
  if (parentId) expandedIds.value = new Set(expandedIds.value).add(parentId)
  await store.createItem(kind, parentId)
  store.activePanel = 'editor'
  if (store.activeItemId) {
    editingId.value = store.activeItemId
    await focusItem(store.activeItemId)
  }
}

async function trashSelected(): Promise<void> {
  if (!store.activeItemId || !unsavedGuard.canTransition()) return
  await store.trashItem(store.activeItemId)
}

function handleDragStart(event: DragEvent, item: BinderItemDto): void {
  draggedId.value = item.id
  event.dataTransfer?.setData('text/plain', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function pointerDropPosition(event: DragEvent, target: BinderItemDto): 'before' | 'inside' | 'after' {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5
  if (target.kind === 'folder' && ratio >= 0.25 && ratio <= 0.75) return 'inside'
  return ratio < 0.5 ? 'before' : 'after'
}

function handleDragOver(event: DragEvent, target: BinderItemDto): void {
  dropTarget.value = { id: target.id, position: pointerDropPosition(event, target) }
}

async function handleDrop(event: DragEvent, target: BinderItemDto): Promise<void> {
  const itemId = event.dataTransfer?.getData('text/plain') || draggedId.value
  if (!itemId || itemId === target.id) return
  const position = pointerDropPosition(event, target)
  if (position === 'inside') {
    const index = childrenOf(target.id).filter((item) => item.id !== itemId).length
    await moveByPointer(itemId, target.id, index)
    expandedIds.value = new Set(expandedIds.value).add(target.id)
  } else {
    const siblings = childrenOf(target.parentId).filter((item) => item.id !== itemId)
    const targetIndex = siblings.findIndex((item) => item.id === target.id)
    await moveByPointer(itemId, target.parentId, targetIndex + (position === 'after' ? 1 : 0))
  }
  draggedId.value = null
  dropTarget.value = null
}

async function restore(itemId: string): Promise<void> {
  if (unsavedGuard.canTransition()) await store.restoreItem(itemId)
}
</script>

<template>
  <nav aria-label="Binder" class="flex h-full min-h-0 flex-col bg-[var(--color-app)]">
    <div class="binder-heading">
      <strong>Binder</strong>
      <BinderToolbar
        :can-act="Boolean(store.activeItem)"
        @add-folder="add('folder')"
        @add-document="add('document')"
        @rename="editingId = store.activeItemId"
        @trash="trashSelected"
      />
    </div>
    <label class="binder-search">
      <i class="pi pi-search" aria-hidden="true" />
      <InputText v-model="query" aria-label="Search binder" placeholder="Search" />
    </label>
    <div role="tree" aria-label="Project binder" class="binder-tree">
      <BinderTreeItem
        v-for="item in visibleItems"
        :key="item.id"
        :item="item"
        :level="levelOf(item)"
        :selected="store.activeItemId === item.id"
        :focused="focusedId === item.id"
        :expanded="expandedIds.has(item.id)"
        :has-children="hasChildren(item)"
        :editing="editingId === item.id"
        :drop-position="dropTarget?.id === item.id ? dropTarget.position : undefined"
        :style="{ '--tree-level': levelOf(item) }"
        @select="selectItem"
        @keydown="handleKeydown"
        @rename="rename"
        @cancel-rename="editingId = null"
        @drag-start="handleDragStart"
        @drag-end="dropTarget = null; draggedId = null"
        @drag-over="handleDragOver"
        @drag-leave="dropTarget = null"
        @drop="handleDrop"
        @toggle="toggle"
        @open-new-tab="openNewTab"
      />

      <div class="binder-trash">
        <div role="treeitem" aria-level="1" aria-expanded="true" tabindex="-1" aria-label="Trash, folder" class="binder-tree-row">
          <i class="pi pi-trash" aria-hidden="true" />
          <span>Trash</span>
        </div>
        <div v-for="item in store.trashedItems" :key="item.id" class="trash-row">
          <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
          <Button
            icon="pi pi-replay"
            text
            :aria-label="`Restore ${item.title}`"
            @click="restore(item.id)"
          />
          <Button
            v-if="pendingDeleteId !== item.id"
            icon="pi pi-times"
            text
            :aria-label="`Permanently delete ${item.title}`"
            @click="pendingDeleteId = item.id"
          />
          <template v-else>
            <Button label="Delete" severity="danger" :aria-label="`Confirm delete ${item.title}`" @click="store.deleteItem(item.id)" />
            <Button label="Cancel" text :aria-label="`Cancel delete ${item.title}`" @click="pendingDeleteId = null" />
          </template>
        </div>
      </div>
    </div>
    <p v-if="store.errorMessage" role="alert" class="binder-error">{{ store.errorMessage }}</p>
  </nav>
</template>
