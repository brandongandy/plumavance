import type { BinderItemDto, BinderItemKind, ProjectDto, SearchResultDto } from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { binderApi, type MoveItemInput } from '../api/binder.js'
import { documentApi } from '../api/documents.js'
import { applyMove } from '../features/binder/useBinderMove.js'
import { useDocumentStore } from './document.js'
import { useWritingProgressStore } from './writing-progress.js'

export type WorkspacePanel = 'binder' | 'editor' | 'inspector'

interface WorkspacePreferences {
  binderWidth: number
  inspectorWidth: number
  binderOpen: boolean
  inspectorOpen: boolean
}

const preferenceKey = 'pluma.workspace.preferences'
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
  const openDocumentIds = ref<string[]>([])
  const activeTabId = ref<string | null>(null)
  const binderOpen = ref(preferences.binderOpen)
  const inspectorOpen = ref(preferences.inspectorOpen)
  const binderWidth = ref(preferences.binderWidth)
  const inspectorWidth = ref(preferences.inspectorWidth)
  const activePanel = ref<WorkspacePanel>('editor')
  const loading = ref(false)
  const errorMessage = ref('')
  let searchSequence = 0
  let loadSequence = 0

  const activeItem = computed(() => items.value.find((item) => item.id === activeItemId.value) ?? null)
  const openDocuments = computed(() => openDocumentIds.value.flatMap((id) => {
    const item = items.value.find((candidate) => candidate.id === id && candidate.kind === 'document')
    return item ? [{ id: item.id, title: item.title }] : []
  }))

  function isDocument(id: string): boolean {
    return items.value.some((item) => item.id === id && item.kind === 'document')
  }

  function activateTab(id: string): void {
    if (!openDocumentIds.value.includes(id) || !isDocument(id)) return
    activeTabId.value = id
    activeItemId.value = id
    activePanel.value = 'editor'
  }

  function replaceActiveDocument(id: string): void {
    if (!isDocument(id)) return
    if (openDocumentIds.value.includes(id)) {
      activateTab(id)
      return
    }
    const index = activeTabId.value ? openDocumentIds.value.indexOf(activeTabId.value) : -1
    if (index >= 0) {
      openDocumentIds.value = openDocumentIds.value.map((documentId, candidateIndex) =>
        candidateIndex === index ? id : documentId,
      )
    } else {
      openDocumentIds.value = [...openDocumentIds.value, id]
    }
    activeTabId.value = id
    activeItemId.value = id
    activePanel.value = 'editor'
  }

  function openDocumentInNewTab(id: string): void {
    if (!isDocument(id)) return
    if (!openDocumentIds.value.includes(id)) openDocumentIds.value = [...openDocumentIds.value, id]
    activateTab(id)
  }

  function closeDocumentTab(id: string): void {
    const index = openDocumentIds.value.indexOf(id)
    if (index < 0) return
    const wasActive = activeTabId.value === id
    openDocumentIds.value = openDocumentIds.value.filter((documentId) => documentId !== id)
    if (!wasActive) return
    const nextId = openDocumentIds.value[Math.min(index, openDocumentIds.value.length - 1)] ?? null
    activeTabId.value = nextId
    if (activeItemId.value === id) activeItemId.value = nextId
  }

  function closeOtherDocumentTabs(id: string): void {
    if (!openDocumentIds.value.includes(id)) return
    openDocumentIds.value = [id]
    activeTabId.value = id
    activeItemId.value = id
    activePanel.value = 'editor'
  }

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
    const sequence = ++loadSequence
    const projectChanged = projectId.value !== id
    const initializeTabs = projectChanged || project.value?.id !== id
    if (projectChanged) {
      project.value = null
      items.value = []
      trashedItems.value = []
      searchResults.value = []
      searchSequence += 1
      activeItemId.value = null
      openDocumentIds.value = []
      activeTabId.value = null
      useDocumentStore().clear()
    }
    projectId.value = id
    const isCurrent = (): boolean => sequence === loadSequence && projectId.value === id
    loading.value = true
    errorMessage.value = ''
    try {
      const writing = useWritingProgressStore()
      const progressLoading = writing.load(id)
      const detail = await binderApi.getProject(id)
      if (!isCurrent()) return
      writing.seedSettings(detail.project)
      await progressLoading
      if (!isCurrent()) return
      project.value = detail.project
      items.value = detail.items
      trashedItems.value = detail.trashedItems
      const availableDocumentIds = new Set(detail.items.filter((item) => item.kind === 'document').map((item) => item.id))
      openDocumentIds.value = openDocumentIds.value.filter((documentId) => availableDocumentIds.has(documentId))
      const firstDocumentId = detail.items.find((item) => item.kind === 'document')?.id ?? null
      if (initializeTabs) {
        openDocumentIds.value = firstDocumentId ? [firstDocumentId] : []
        activeTabId.value = firstDocumentId
      } else if (!activeTabId.value || !openDocumentIds.value.includes(activeTabId.value)) {
        activeTabId.value = openDocumentIds.value[0] ?? null
      }
      activeItemId.value = activeItemId.value && detail.items.some((item) => item.id === activeItemId.value)
        ? activeItemId.value
        : activeTabId.value ?? (initializeTabs ? detail.items[0]?.id ?? null : null)
      activePanel.value = 'editor'
    } catch (error) {
      if (isCurrent()) errorMessage.value = errorText(error, 'The project could not be opened.')
    } finally {
      if (isCurrent()) loading.value = false
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
    if (created.kind === 'document') replaceActiveDocument(created.id)
    else activeItemId.value = created.id
    await useWritingProgressStore().refresh()
  }

  async function renameItem(id: string, title: string): Promise<void> {
    const item = items.value.find((candidate) => candidate.id === id)
    const trimmed = title.trim()
    if (!item || !trimmed) return
    if (item.kind === 'folder') {
      const renamed = await binderApi.rename(id, trimmed)
      items.value = items.value.map((candidate) => (candidate.id === id ? renamed : candidate))
      return
    }

    const documents = useDocumentStore()
    let saved = false
    if (documents.documentId === id) {
      documents.setTitle(trimmed)
      saved = await documents.save()
    } else {
      const current = await documentApi.get(id)
      await documentApi.save(id, {
        title: trimmed,
        contentJson: current.contentJson,
        notesText: current.notesText,
        expectedRevision: current.revision,
      })
      saved = true
    }
    if (saved) {
      items.value = items.value.map((candidate) => candidate.id === id ? { ...candidate, title: trimmed } : candidate)
      await useWritingProgressStore().refresh()
    }
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
    const activeIndex = activeTabId.value ? openDocumentIds.value.indexOf(activeTabId.value) : -1
    const activeTabRemoved = activeTabId.value ? descendantIds.has(activeTabId.value) : false
    const activeItemRemoved = descendantIds.has(activeItemId.value ?? '')
    openDocumentIds.value = openDocumentIds.value.filter((documentId) => !descendantIds.has(documentId))
    if (activeTabRemoved) {
      activeTabId.value = openDocumentIds.value[Math.min(activeIndex, openDocumentIds.value.length - 1)] ?? null
    }
    items.value = items.value.filter((item) => !descendantIds.has(item.id))
    trashedItems.value = [trashed, ...trashedItems.value]
    if (activeItemRemoved) activeItemId.value = activeTabId.value ?? items.value[0]?.id ?? null
    await useWritingProgressStore().refresh()
  }

  async function restoreItem(id: string): Promise<void> {
    const selected = activeItemId.value
    await binderApi.restore(id)
    trashedItems.value = trashedItems.value.filter((item) => item.id !== id)
    const detail = await binderApi.getProject(projectId.value)
    project.value = detail.project
    items.value = detail.items
    trashedItems.value = detail.trashedItems
    activeItemId.value = selected && detail.items.some((item) => item.id === selected) ? selected : null
    await useWritingProgressStore().refresh()
  }

  async function deleteItem(id: string): Promise<void> {
    await binderApi.delete(id)
    trashedItems.value = trashedItems.value.filter((item) => item.id !== id)
    await useWritingProgressStore().refresh()
  }

  async function search(query: string, signal?: AbortSignal): Promise<void> {
    const normalized = query.trim()
    const sequence = ++searchSequence
    if (!normalized) {
      searchResults.value = []
      return
    }
    try {
      const results = await binderApi.search(projectId.value, normalized, signal)
      if (sequence === searchSequence) searchResults.value = results
    } catch (error) {
      if (signal?.aborted) return
      if (sequence === searchSequence) errorMessage.value = errorText(error, 'Search failed.')
    }
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
    openDocumentIds,
    openDocuments,
    activeTabId,
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
    activateTab,
    replaceActiveDocument,
    openDocumentInNewTab,
    closeDocumentTab,
    closeOtherDocumentTabs,
    setBinderWidth,
    setInspectorWidth,
  }
})
