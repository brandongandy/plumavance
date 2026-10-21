import type { BinderItemDto, BinderItemKind, ProjectDto, SearchResultDto } from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { binderApi, type MoveItemInput } from '../api/binder.js'
import { ApiRequestError } from '../api/client.js'
import { documentApi } from '../api/documents.js'
import { applyMove } from '../features/binder/useBinderMove.js'
import { useDocumentStore, type DocumentSession } from './document.js'
import { useWritingProgressStore } from './writing-progress.js'

export type WorkspacePanel = 'binder' | 'editor' | 'inspector'
export type SplitOrientation = 'vertical' | 'horizontal'

interface WorkspacePreferences {
  binderWidth: number
  inspectorWidth: number
  binderOpen: boolean
  inspectorOpen: boolean
  splitRatios: Record<SplitOrientation, number>
}

const preferenceKey = 'pluma.workspace.preferences'
const defaults: WorkspacePreferences = {
  binderWidth: 240,
  inspectorWidth: 280,
  binderOpen: true,
  inspectorOpen: true,
  splitRatios: { vertical: 0.5, horizontal: 0.5 },
}

function normalizeSplitRatio(ratio: unknown): number {
  return typeof ratio === 'number' && Number.isFinite(ratio)
    ? Math.min(0.8, Math.max(0.2, ratio)) : 0.5
}

function loadPreferences(): WorkspacePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Partial<WorkspacePreferences>
    return {
      binderWidth: Math.min(420, Math.max(180, value.binderWidth ?? defaults.binderWidth)),
      inspectorWidth: Math.min(420, Math.max(220, value.inspectorWidth ?? defaults.inspectorWidth)),
      binderOpen: value.binderOpen ?? true,
      inspectorOpen: value.inspectorOpen ?? true,
      splitRatios: {
        vertical: normalizeSplitRatio(value.splitRatios?.vertical),
        horizontal: normalizeSplitRatio(value.splitRatios?.horizontal),
      },
    }
  } catch {
    return { ...defaults }
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function editableBuffer(session: DocumentSession | undefined): string {
  return JSON.stringify(session ? [session.title, session.contentJson, session.notesText] : null)
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const preferences = loadPreferences()
  const projectId = ref('')
  const project = ref<ProjectDto | null>(null)
  const items = ref<BinderItemDto[]>([])
  const trashedItems = ref<BinderItemDto[]>([])
  const retainedTrashDocumentIds = ref(new Map<string, string[]>())
  const searchResults = ref<SearchResultDto[]>([])
  const activeItemId = ref<string | null>(null)
  const openDocumentIds = ref<string[]>([])
  const activeTabId = ref<string | null>(null)
  const splitOrientation = shallowRef<SplitOrientation | null>(null)
  const splitDocumentIds = ref<[] | [string, string]>([])
  const recentDocumentIds = ref<string[]>([])
  const splitRatios = ref({ ...preferences.splitRatios })
  const binderOpen = ref(preferences.binderOpen)
  const inspectorOpen = ref(preferences.inspectorOpen)
  const binderWidth = ref(preferences.binderWidth)
  const inspectorWidth = ref(preferences.inspectorWidth)
  const activePanel = ref<WorkspacePanel>('editor')
  const loading = ref(false)
  const errorMessage = ref('')
  let searchSequence = 0
  let loadSequence = 0
  let projectEpoch = 0

  const activeItem = computed(() => items.value.find((item) => item.id === activeItemId.value) ?? null)
  const isSplit = computed(() => splitOrientation.value !== null && splitDocumentIds.value.length === 2)
  const renderedDocumentIds = computed(() => {
    if (activeItem.value?.kind !== 'document') return []
    return isSplit.value ? [...splitDocumentIds.value] : activeTabId.value ? [activeTabId.value] : []
  })
  const openDocuments = computed(() => openDocumentIds.value.flatMap((id) => {
    const item = items.value.find((candidate) => candidate.id === id && candidate.kind === 'document')
    return item ? [{ id: item.id, title: item.title }] : []
  }))

  function isDocument(id: string): boolean {
    return items.value.some((item) => item.id === id && item.kind === 'document')
  }

  function rememberDocument(id: string): void {
    recentDocumentIds.value = [id, ...recentDocumentIds.value.filter((documentId) => documentId !== id)]
  }

  function activateTab(id: string): void {
    if (!openDocumentIds.value.includes(id) || !isDocument(id)) return
    if (isSplit.value && !splitDocumentIds.value.some((documentId) => documentId === id)) {
      const [first, second] = splitDocumentIds.value as [string, string]
      splitDocumentIds.value = activeTabId.value === second ? [first, id] : [id, second]
    }
    activeTabId.value = id
    activeItemId.value = id
    activePanel.value = 'editor'
    rememberDocument(id)
  }

  function enterSplit(orientation: SplitOrientation): void {
    if (isSplit.value) {
      splitOrientation.value = orientation
      return
    }
    const focusedId = activeTabId.value
    if (!focusedId || !isDocument(focusedId) || !openDocumentIds.value.includes(focusedId)) return
    const candidates = openDocumentIds.value.filter((id) => id !== focusedId && isDocument(id))
    const index = openDocumentIds.value.indexOf(focusedId)
    const otherId = recentDocumentIds.value.find((id) => candidates.includes(id))
      ?? openDocumentIds.value.slice(index + 1).find((id) => candidates.includes(id))
      ?? openDocumentIds.value.slice(0, index).reverse().find((id) => candidates.includes(id))
    if (!otherId) return
    splitDocumentIds.value = [focusedId, otherId]
    splitOrientation.value = orientation
  }

  function exitSplit(): void {
    splitDocumentIds.value = []
    splitOrientation.value = null
  }

  function setSplitRatio(orientation: SplitOrientation, ratio: number): void {
    splitRatios.value = { ...splitRatios.value, [orientation]: normalizeSplitRatio(ratio) }
  }

  // Callers confirm dirty sessions before invoking actions that remove tabs.
  function removeDocumentTabs(ids: readonly string[], retainedIds: ReadonlySet<string> = new Set()): void {
    const removed = new Set(ids)
    const activeIndex = activeTabId.value ? openDocumentIds.value.indexOf(activeTabId.value) : -1
    const splitRemoved = splitDocumentIds.value.some((id) => removed.has(id))
    const survivor = splitDocumentIds.value.find((id) => !removed.has(id))
    openDocumentIds.value = openDocumentIds.value.filter((id) => !removed.has(id))
    recentDocumentIds.value = recentDocumentIds.value.filter((id) => !removed.has(id))
    for (const id of removed) {
      if (!retainedIds.has(id)) useDocumentStore().discard(id)
    }
    if (splitRemoved) exitSplit()
    if (splitRemoved || (activeTabId.value && removed.has(activeTabId.value))) {
      activeTabId.value = survivor ?? openDocumentIds.value[Math.min(Math.max(activeIndex, 0), openDocumentIds.value.length - 1)] ?? null
      if (splitRemoved || (activeItemId.value && removed.has(activeItemId.value))) activeItemId.value = activeTabId.value
      if (activeTabId.value) rememberDocument(activeTabId.value)
    }
  }

  function replaceActiveDocument(id: string): void {
    if (!isDocument(id)) return
    if (openDocumentIds.value.includes(id)) {
      activateTab(id)
      return
    }
    const index = activeTabId.value ? openDocumentIds.value.indexOf(activeTabId.value) : -1
    const previousId = activeTabId.value
    if (index >= 0) {
      openDocumentIds.value = openDocumentIds.value.map((documentId, candidateIndex) =>
        candidateIndex === index ? id : documentId,
      )
    } else {
      openDocumentIds.value = [...openDocumentIds.value, id]
    }
    activateTab(id)
    if (index >= 0 && previousId) {
      recentDocumentIds.value = recentDocumentIds.value.filter((documentId) => documentId !== previousId)
      useDocumentStore().discard(previousId)
    }
  }

  function openDocumentInNewTab(id: string): void {
    if (!isDocument(id)) return
    if (!openDocumentIds.value.includes(id)) openDocumentIds.value = [...openDocumentIds.value, id]
    activateTab(id)
  }

  function closeDocumentTab(id: string): void {
    if (openDocumentIds.value.includes(id)) removeDocumentTabs([id])
  }

  function closeOtherDocumentTabs(id: string): void {
    if (!openDocumentIds.value.includes(id)) return
    removeDocumentTabs(openDocumentIds.value.filter((documentId) => documentId !== id))
    exitSplit()
    activateTab(id)
  }

  watch(
    [binderOpen, inspectorOpen, binderWidth, inspectorWidth, splitRatios],
    () => {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          binderOpen: binderOpen.value,
          inspectorOpen: inspectorOpen.value,
          binderWidth: binderWidth.value,
          inspectorWidth: inspectorWidth.value,
          splitRatios: splitRatios.value,
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
      projectEpoch += 1
      project.value = null
      items.value = []
      trashedItems.value = []
      retainedTrashDocumentIds.value.clear()
      searchResults.value = []
      searchSequence += 1
      activeItemId.value = null
      openDocumentIds.value = []
      activeTabId.value = null
      exitSplit()
      recentDocumentIds.value = []
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
      reconcileRestoredSessions()
      const availableDocumentIds = new Set(detail.items.filter((item) => item.kind === 'document').map((item) => item.id))
      removeDocumentTabs(openDocumentIds.value.filter((documentId) => !availableDocumentIds.has(documentId)))
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

  async function createItem(kind: BinderItemKind, parentId: string | null): Promise<string | undefined> {
    const creatingProjectId = projectId.value
    const creatingEpoch = projectEpoch
    const selectedId = activeItemId.value
    const replacementId = activeTabId.value
    const documents = useDocumentStore()
    const replacementSession = replacementId ? documents.sessionFor(replacementId) : undefined
    const approvedBuffer = editableBuffer(replacementSession)
    const approvedSavedBuffer = replacementSession?.savedBuffer
    const approvedDirty = replacementSession?.isDirty
    const approvedPendingSave = replacementSession?.pendingSave
    const title = kind === 'folder' ? 'Untitled Folder' : 'Untitled Document'
    const created = await binderApi.create(creatingProjectId, { kind, parentId, title })
    if (projectId.value !== creatingProjectId || projectEpoch !== creatingEpoch) return
    const canReplace = activeItemId.value === selectedId && activeTabId.value === replacementId
      && (!replacementId || documents.sessionFor(replacementId) === replacementSession)
      && editableBuffer(replacementSession) === approvedBuffer
      && replacementSession?.savedBuffer === approvedSavedBuffer
      && replacementSession?.isDirty === approvedDirty
      && replacementSession?.pendingSave === approvedPendingSave
    items.value = applyMove([...items.value.filter((item) => item.id !== created.id), created], {
      itemId: created.id,
      parentId: created.parentId,
      index: created.position,
    })
    if (created.kind === 'document') {
      if (canReplace) replaceActiveDocument(created.id)
      else openDocumentIds.value = [...new Set([...openDocumentIds.value, created.id])]
    } else if (canReplace) activeItemId.value = created.id
    await useWritingProgressStore().refresh()
    return created.id
  }

  async function renameItem(id: string, title: string): Promise<void> {
    const epoch = projectEpoch
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
    const session = documents.sessionFor(id)
    if (session) {
      if (session.loading || !session.savedBuffer) {
        const loaded = await documents.load(id)
        if (projectEpoch !== epoch || documents.sessionFor(id) !== session) return
        if (!loaded) {
          errorMessage.value = session.errorMessage || 'The document must load before it can be renamed.'
          return
        }
      }
      documents.setTitle(id, trimmed)
      saved = await documents.save(id)
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
    if (saved && projectEpoch === epoch) {
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

  function itemIdsInSubtree(id: string): Set<string> {
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
    return descendantIds
  }

  function documentIdsInSubtree(id: string): string[] {
    const descendants = itemIdsInSubtree(id)
    return items.value.filter((item) => item.kind === 'document' && descendants.has(item.id)).map((item) => item.id)
  }

  async function trashItem(id: string, canDiscardChanges: (ids: readonly string[]) => boolean = () => false): Promise<void> {
    const epoch = projectEpoch
    const documents = useDocumentStore()
    const descendantIds = itemIdsInSubtree(id)
    const approved = new Map(documentIdsInSubtree(id).map((documentId) => {
      const session = documents.sessionFor(documentId)
      return [documentId, {
        session, buffer: editableBuffer(session), savedBuffer: session?.savedBuffer, isDirty: session?.isDirty,
        pendingSave: session?.pendingSave,
      }] as const
    }))
    errorMessage.value = ''
    try {
      const trashed = await binderApi.trash(id)
      if (projectEpoch !== epoch) return
      for (const itemId of itemIdsInSubtree(id)) descendantIds.add(itemId)
      const targetIds = [...new Set([...approved.keys(), ...documentIdsInSubtree(id)])]
      const changedDirtyIds = targetIds.filter((documentId) => {
        const session = documents.sessionFor(documentId)
        const original = approved.get(documentId)
        return session?.needsDiscardConfirmation && (
          session !== original?.session || editableBuffer(session) !== original?.buffer
          || session.savedBuffer !== original?.savedBuffer || session.isDirty !== original?.isDirty
          || session.pendingSave !== original?.pendingSave
        )
      })
      const retainedIds = new Set(changedDirtyIds.length && !canDiscardChanges(changedDirtyIds) ? changedDirtyIds : [])
      if (retainedIds.size) retainedTrashDocumentIds.value.set(id, [...retainedIds])
      const activeItemRemoved = descendantIds.has(activeItemId.value ?? '')
      removeDocumentTabs(targetIds, retainedIds)
      items.value = items.value.filter((item) => !descendantIds.has(item.id))
      trashedItems.value = [trashed, ...trashedItems.value.filter((item) => item.id !== id)]
      if (activeItemRemoved) activeItemId.value = activeTabId.value ?? items.value[0]?.id ?? null
      await useWritingProgressStore().refresh()
    } catch (error) {
      if (projectEpoch === epoch) errorMessage.value = errorText(error, 'The item could not be moved to Trash.')
      throw error
    }
  }

  function reconcileRestoredSessions(): void {
    for (const id of retainedTrashDocumentIds.value.keys()) {
      if (items.value.some((item) => item.id === id)) retainedTrashDocumentIds.value.delete(id)
    }
  }

  async function restoreItem(id: string): Promise<void> {
    const epoch = projectEpoch
    errorMessage.value = ''
    try {
      try {
        await binderApi.restore(id)
      } catch (error) {
        // A prior restore can succeed even if its following project refresh failed.
        if (!(error instanceof ApiRequestError && error.code === 'BINDER_ITEM_NOT_TRASHED')) throw error
      }
      if (projectEpoch !== epoch) return
      const detail = await binderApi.getProject(projectId.value)
      if (projectEpoch !== epoch) return
      const selected = activeItemId.value
      project.value = detail.project
      items.value = detail.items
      trashedItems.value = detail.trashedItems
      reconcileRestoredSessions()
      activeItemId.value = selected && detail.items.some((item) => item.id === selected) ? selected : null
      await useWritingProgressStore().refresh()
    } catch (error) {
      if (projectEpoch === epoch) errorMessage.value = errorText(error, 'The item could not be restored.')
      throw error
    }
  }

  async function deleteItem(id: string): Promise<void> {
    if (retainedTrashDocumentIds.value.has(id)) {
      errorMessage.value = 'Restore this item to recover its unsaved edits before deleting it.'
      return
    }
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
    retainedTrashDocumentIds,
    searchResults,
    activeItemId,
    activeItem,
    openDocumentIds,
    openDocuments,
    activeTabId,
    splitOrientation,
    splitDocumentIds,
    recentDocumentIds,
    splitRatios,
    renderedDocumentIds,
    isSplit,
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
    enterSplit,
    exitSplit,
    setSplitRatio,
    documentIdsInSubtree,
    setBinderWidth,
    setInspectorWidth,
  }
})
