import type { BinderItemDto, BinderItemKind, ProjectDto, SearchResultDto } from '@scr/shared'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { binderApi, type MoveItemInput } from '../api/binder.js'
import { applyMove } from '../features/binder/useBinderMove.js'

export type WorkspacePanel = 'binder' | 'editor' | 'inspector'

interface WorkspacePreferences {
  binderWidth: number
  inspectorWidth: number
  binderOpen: boolean
  inspectorOpen: boolean
}

const preferenceKey = 'scr.workspace.preferences'
const defaults: WorkspacePreferences = {
  binderWidth: 240,
  inspectorWidth: 280,
  binderOpen: true,
  inspectorOpen: true,
}

function loadPreferences(): WorkspacePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Partial<WorkspacePreferences>
    return {
      binderWidth: Math.min(420, Math.max(180, value.binderWidth ?? defaults.binderWidth)),
      inspectorWidth: Math.min(420, Math.max(220, value.inspectorWidth ?? defaults.inspectorWidth)),
      binderOpen: value.binderOpen ?? true,
      inspectorOpen: value.inspectorOpen ?? true,
    }
  } catch {
    return { ...defaults }
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const preferences = loadPreferences()
  const projectId = ref('')
  const project = ref<ProjectDto | null>(null)
  const items = ref<BinderItemDto[]>([])
  const trashedItems = ref<BinderItemDto[]>([])
  const searchResults = ref<SearchResultDto[]>([])
  const activeItemId = ref<string | null>(null)
  const binderOpen = ref(preferences.binderOpen)
  const inspectorOpen = ref(preferences.inspectorOpen)
  const binderWidth = ref(preferences.binderWidth)
  const inspectorWidth = ref(preferences.inspectorWidth)
  const activePanel = ref<WorkspacePanel>('editor')
  const loading = ref(false)
  const errorMessage = ref('')

  const activeItem = computed(() => items.value.find((item) => item.id === activeItemId.value) ?? null)

  watch(
    [binderOpen, inspectorOpen, binderWidth, inspectorWidth],
    () => {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          binderOpen: binderOpen.value,
          inspectorOpen: inspectorOpen.value,
          binderWidth: binderWidth.value,
          inspectorWidth: inspectorWidth.value,
        }),
      )
    },
    { flush: 'sync' },
  )

  async function load(id: string): Promise<void> {
    projectId.value = id
    loading.value = true
    errorMessage.value = ''
    try {
      const detail = await binderApi.getProject(id)
      project.value = detail.project
      items.value = detail.items
      trashedItems.value = detail.trashedItems
      activeItemId.value = detail.items.find((item) => item.kind === 'document')?.id ?? detail.items[0]?.id ?? null
      activePanel.value = 'editor'
    } catch (error) {
      errorMessage.value = errorText(error, 'The project could not be opened.')
    } finally {
      loading.value = false
    }
  }

  async function createItem(kind: BinderItemKind, parentId: string | null): Promise<void> {
    const title = kind === 'folder' ? 'Untitled Folder' : 'Untitled Document'
    const created = await binderApi.create(projectId.value, { kind, parentId, title })
    items.value = applyMove([...items.value, created], {
      itemId: created.id,
      parentId: created.parentId,
      index: created.position,
    })
    activeItemId.value = created.id
  }

  async function renameItem(id: string, title: string): Promise<void> {
    const renamed = await binderApi.rename(id, title.trim())
    items.value = items.value.map((item) => (item.id === id ? renamed : item))
  }

  async function moveItem(intent: MoveItemInput): Promise<void> {
    const previous = items.value.map((item) => ({ ...item }))
    errorMessage.value = ''
    items.value = applyMove(items.value, intent)
    try {
      const moved = await binderApi.move(intent)
      items.value = items.value.map((item) => (item.id === moved.id ? { ...item, ...moved } : item))
    } catch (error) {
      items.value = previous
      errorMessage.value = errorText(error, 'The item could not be moved.')
      throw error
    }
  }

  async function trashItem(id: string): Promise<void> {
    const trashed = await binderApi.trash(id)
    const descendantIds = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const candidate of items.value) {
        if (candidate.parentId && descendantIds.has(candidate.parentId) && !descendantIds.has(candidate.id)) {
          descendantIds.add(candidate.id)
          changed = true
        }
      }
    }
    items.value = items.value.filter((item) => !descendantIds.has(item.id))
    trashedItems.value = [trashed, ...trashedItems.value]
    if (descendantIds.has(activeItemId.value ?? '')) activeItemId.value = items.value[0]?.id ?? null
  }

  async function restoreItem(id: string): Promise<void> {
    const restored = await binderApi.restore(id)
    trashedItems.value = trashedItems.value.filter((item) => item.id !== id)
    await load(projectId.value)
    activeItemId.value = restored.id
  }

  async function deleteItem(id: string): Promise<void> {
    await binderApi.delete(id)
    trashedItems.value = trashedItems.value.filter((item) => item.id !== id)
  }

  async function search(query: string): Promise<void> {
    searchResults.value = query.trim()
      ? await binderApi.search(projectId.value, query.trim())
      : []
  }

  function setBinderWidth(width: number): void {
    binderWidth.value = Math.min(420, Math.max(180, width))
  }

  function setInspectorWidth(width: number): void {
    inspectorWidth.value = Math.min(420, Math.max(220, width))
  }

  return {
    projectId,
    project,
    items,
    trashedItems,
    searchResults,
    activeItemId,
    activeItem,
    binderOpen,
    inspectorOpen,
    binderWidth,
    inspectorWidth,
    activePanel,
    loading,
    errorMessage,
    load,
    createItem,
    renameItem,
    moveItem,
    trashItem,
    restoreItem,
    deleteItem,
    search,
    setBinderWidth,
    setInspectorWidth,
  }
})
