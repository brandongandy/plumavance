import type { BinderItemDto, DocumentDto, ProjectDto } from '@pluma/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { binderApi } from '../src/api/binder.js'
import { documentApi } from '../src/api/documents.js'
import { snapshotApi } from '../src/api/snapshots.js'
import { useDocumentStore } from '../src/stores/document.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'

const projectId = 'project'
const firstId = 'first'
const secondId = 'second'
const thirdId = 'third'
const fourthId = 'fourth'
const folderId = 'folder'
const stamp = '2026-10-20T00:00:00.000Z'
const preferenceKey = 'pluma.workspace.preferences'
const project: ProjectDto = {
  id: projectId, name: 'Draft', createdAt: stamp, updatedAt: stamp, lastOpenedAt: stamp,
  projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions',
}
const items: BinderItemDto[] = [
  { id: folderId, kind: 'folder' as const, parentId: null },
  { id: firstId, kind: 'document' as const, parentId: folderId },
  { id: secondId, kind: 'document' as const, parentId: folderId },
  { id: thirdId, kind: 'document' as const, parentId: null },
  { id: fourthId, kind: 'document' as const, parentId: null },
].map((item, position) => ({ ...item, projectId, title: item.id, position, trashedAt: null, createdAt: stamp, updatedAt: stamp }))

function workspace() {
  const store = useWorkspaceStore()
  store.$patch({ projectId, project, items: structuredClone(items), openDocumentIds: [firstId, secondId, thirdId] })
  store.activateTab(firstId)
  return store
}

function documentFixture(id: string): DocumentDto {
  return { id, projectId, title: id, contentJson: { type: 'doc', content: [{ type: 'paragraph' }] }, contentText: '', notesText: '', revision: 3, savedAt: stamp }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
  vi.spyOn(documentApi, 'get').mockImplementation(async (id) => documentFixture(id))
})

afterEach(() => {
  useWritingProgressStore().dispose()
  vi.restoreAllMocks()
})

describe('workspace split state', () => {
  test.each(['create', 'trash'] as const)('a_new_divergent_pending_write_invalidates_%s_approval_before_the_save_finishes', async (action) => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    const session = documents.sessionFor(firstId)!
    let finishAction!: () => void
    let finishSave!: () => void
    const created = { ...items[1]!, id: 'created' }
    vi.spyOn(binderApi, 'create').mockImplementation(() => new Promise((resolve) => { finishAction = () => resolve(created) }))
    vi.spyOn(binderApi, 'trash').mockImplementation(() => new Promise((resolve) => { finishAction = () => resolve({ ...items[1]!, trashedAt: stamp }) }))
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => { finishSave = () => resolve({ ...documentFixture(id), ...payload, revision: 4 }) }))
    const confirm = vi.fn(() => false)
    const actionPending = action === 'create' ? store.createItem('document', folderId) : store.trashItem(firstId, confirm)
    documents.setNotes(firstId, 'Pending notes')
    const saving = documents.save(firstId)
    documents.setNotes(firstId, '')
    expect(session.isDirty).toBe(false)
    finishAction()
    await actionPending
    expect(documents.sessionFor(firstId)).toBe(session)
    if (action === 'trash') {
      expect(confirm).toHaveBeenCalledExactlyOnceWith([firstId])
      expect(store.retainedTrashDocumentIds.get(firstId)).toEqual([firstId])
    } else {
      expect(store.activeTabId).toBe(firstId)
      expect(store.openDocumentIds).toContain(created.id)
    }
    finishSave()
    expect(await saving).toBe(true)
    expect(session.isDirty).toBe(true)
  })

  test.each(['success', 'failure', 'discard'] as const)('rename_waits_for_the_current_initial_load_%s', async (outcome) => {
    const store = workspace()
    const documents = useDocumentStore()
    let finish!: (value: DocumentDto) => void
    let fail!: (error: Error) => void
    vi.mocked(documentApi.get).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
    const save = vi.spyOn(documentApi, 'save').mockImplementation(async (id, payload) => ({ ...documentFixture(id), ...payload, revision: 4 }))
    const loading = documents.load(firstId)
    const renaming = store.renameItem(firstId, 'Renamed chapter')
    expect(documents.sessionFor(firstId)?.title).toBe('')
    expect(save).not.toHaveBeenCalled()
    store.activateTab(secondId)
    if (outcome === 'discard') {
      documents.discard(firstId)
      await documents.load(firstId)
    }
    if (outcome === 'failure') fail(new Error('Initial load failed'))
    else finish(documentFixture(firstId))
    await Promise.all([loading, renaming])
    expect(documentApi.get).toHaveBeenCalledTimes(outcome === 'discard' ? 2 : 1)
    expect(store.activeTabId).toBe(secondId)
    if (outcome === 'success') {
      expect(save).toHaveBeenCalledExactlyOnceWith(firstId, expect.objectContaining({ title: 'Renamed chapter', expectedRevision: 3 }))
      expect(documents.sessionFor(firstId)?.title).toBe('Renamed chapter')
      expect(store.items.find((item) => item.id === firstId)?.title).toBe('Renamed chapter')
    } else {
      expect(save).not.toHaveBeenCalled()
      expect(store.items.find((item) => item.id === firstId)?.title).toBe(firstId)
      if (outcome === 'failure') expect(store.errorMessage).toContain('Initial load failed')
      else expect(documents.sessionFor(firstId)?.title).toBe(firstId)
    }
  })

  test.each([[firstId, secondId], [folderId, secondId], [firstId, folderId]])('restore_preserves_navigation_from_%s_to_%s_during_refresh', async (initial, next) => {
    const store = workspace()
    store.activeItemId = initial
    vi.spyOn(binderApi, 'restore').mockResolvedValue(items[4]!)
    let finish!: (value: Awaited<ReturnType<typeof binderApi.getProject>>) => void
    vi.spyOn(binderApi, 'getProject').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const restoring = store.restoreItem(fourthId)
    await Promise.resolve()
    if (next === folderId) store.activeItemId = folderId
    else store.activateTab(next!)
    finish({ project, items, trashedItems: [] })
    await restoring
    expect(store.activeItemId).toBe(next)
    expect(store.activeTabId).toBe(next === folderId ? firstId : next)
    expect(store.renderedDocumentIds).toEqual(next === folderId ? [] : [next])
  })

  test('ignores_an_old_create_when_the_same_project_is_reopened_with_the_created_item', async () => {
    // Catches an A→B→A response matching the project ID but belonging to an obsolete workspace incarnation.
    const store = workspace()
    const created = { ...items[1]!, id: 'created', title: 'Created chapter' }
    let finish!: (item: BinderItemDto) => void
    vi.spyOn(binderApi, 'create').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    vi.spyOn(binderApi, 'getProject').mockImplementation(async (id) => ({
      project: { ...project, id }, items: id === projectId ? [...items, created] : [], trashedItems: [],
    }))
    vi.spyOn(useWritingProgressStore(), 'load').mockResolvedValue()
    const creating = store.createItem('document', folderId)
    await store.load('other-project')
    await store.load(projectId)
    store.openDocumentInNewTab(created.id)
    store.activateTab(firstId)
    finish(created)
    await creating
    expect(store.items.filter((item) => item.id === created.id)).toHaveLength(1)
    expect(store.openDocumentIds).toEqual([firstId, created.id])
    expect(store.activeTabId).toBe(firstId)
    expect(store.activeItemId).toBe(firstId)
  })

  test('reconciles_a_create_already_seen_by_a_same_project_refresh_without_duplicate_ids', async () => {
    const store = workspace()
    const created = { ...items[1]!, id: 'created', title: 'Created chapter' }
    let finish!: (item: BinderItemDto) => void
    vi.spyOn(binderApi, 'create').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const creating = store.createItem('document', folderId)
    store.items.push(created)
    store.openDocumentInNewTab(created.id)
    finish(created)
    await creating
    expect(store.items.filter((item) => item.id === created.id)).toHaveLength(1)
    expect(store.openDocumentIds.filter((id) => id === created.id)).toHaveLength(1)
  })

  test('enters_with_the_focused_and_most_recent_other_tab', () => {
    const store = workspace()
    store.activateTab(secondId)
    store.activateTab(firstId)
    store.enterSplit('vertical')
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.activeTabId).toBe(firstId)
    expect(store.renderedDocumentIds).toEqual([firstId, secondId])
    expect(store.isSplit).toBe(true)
  })

  test.each([firstId, thirdId])('falls_back_to_an_adjacent_tab_without_other_history_from_%s', (focusedId) => {
    const store = workspace()
    store.activeTabId = focusedId
    store.activeItemId = focusedId
    store.recentDocumentIds = ['closed', focusedId]
    store.enterSplit('horizontal')
    expect(store.splitDocumentIds).toEqual([focusedId, secondId])
  })

  test.each([{ ids: [] }, { ids: [firstId] }, { ids: [firstId, firstId] }])('does_not_split_fewer_than_two_distinct_tabs_$ids', ({ ids }) => {
    const store = workspace()
    store.openDocumentIds = ids
    store.enterSplit('vertical')
    expect(store.splitDocumentIds).toEqual([])
    expect(store.splitOrientation).toBeNull()
    expect(store.isSplit).toBe(false)
  })

  test('a_third_tab_replaces_only_the_focused_split_participant', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(thirdId)
    expect(store.splitDocumentIds).toEqual([thirdId, secondId])
    expect(store.openDocumentIds).toEqual([firstId, secondId, thirdId])
    expect(store.activeTabId).toBe(thirdId)
    expect(store.recentDocumentIds).toEqual([thirdId, firstId])
  })

  test('an_existing_participant_only_receives_focus', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(secondId)
    store.activateTab(secondId)
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.activeTabId).toBe(secondId)
    expect(store.activeItemId).toBe(secondId)
    expect(store.recentDocumentIds).toEqual([secondId, firstId])
  })

  test('orientation_changes_preserve_order_and_focus', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(secondId)
    store.enterSplit('horizontal')
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.activeTabId).toBe(secondId)
    expect(store.splitOrientation).toBe('horizontal')
  })

  test('explicit_exit_keeps_tabs_and_the_focused_document', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(secondId)
    store.exitSplit()
    expect(store.splitDocumentIds).toEqual([])
    expect(store.splitOrientation).toBeNull()
    expect(store.openDocumentIds).toEqual([firstId, secondId, thirdId])
    expect(store.activeTabId).toBe(secondId)
    expect(store.renderedDocumentIds).toEqual([secondId])
  })

  test('folder_selection_suspends_rendering_and_returning_resumes_the_split', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activeItemId = folderId
    expect(store.renderedDocumentIds).toEqual([])
    expect(store.isSplit).toBe(true)
    store.activateTab(firstId)
    expect(store.renderedDocumentIds).toEqual([firstId, secondId])
  })

  test('binder_replacement_updates_the_focused_tab_and_matching_slot', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(secondId)
    store.enterSplit('vertical')
    store.activateTab(secondId)
    store.replaceActiveDocument(fourthId)
    expect(store.openDocumentIds).toEqual([firstId, fourthId, thirdId])
    expect(store.splitDocumentIds).toEqual([firstId, fourthId])
    expect(store.activeTabId).toBe(fourthId)
    expect(documents.sessionFor(secondId)).toBeUndefined()
    expect(store.recentDocumentIds).not.toContain(secondId)
  })

  test('binder_replacement_with_an_open_participant_does_not_duplicate_it', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.replaceActiveDocument(secondId)
    expect(store.openDocumentIds).toEqual([firstId, secondId, thirdId])
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.activeTabId).toBe(secondId)
  })

  test('opening_a_new_tab_replaces_the_focused_slot_without_closing_tabs', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.openDocumentInNewTab(fourthId)
    expect(store.openDocumentIds).toEqual([firstId, secondId, thirdId, fourthId])
    expect(store.splitDocumentIds).toEqual([fourthId, secondId])
    expect(store.activeTabId).toBe(fourthId)
  })

  test.each([firstId, secondId])('closing_split_participant_%s_exits_to_the_survivor', async (closedId) => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(closedId)
    await documents.load(thirdId)
    store.enterSplit('vertical')
    store.closeDocumentTab(closedId)
    const survivor = closedId === firstId ? secondId : firstId
    expect(store.splitOrientation).toBeNull()
    expect(store.splitDocumentIds).toEqual([])
    expect(store.activeTabId).toBe(survivor)
    expect(store.activeItemId).toBe(survivor)
    expect(documents.sessionFor(closedId)).toBeUndefined()
    expect(documents.sessionFor(thirdId)).toBeDefined()
    expect(store.recentDocumentIds).not.toContain(closedId)
  })

  test('closing_a_background_tab_keeps_the_split_and_discards_only_its_session', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(thirdId)
    store.enterSplit('vertical')
    store.closeDocumentTab(thirdId)
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.activeTabId).toBe(firstId)
    expect(documents.sessionFor(thirdId)).toBeUndefined()
  })

  test('closing_to_a_survivor_records_it_as_the_most_recent_focus', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(thirdId)
    store.closeDocumentTab(thirdId)
    expect(store.activeTabId).toBe(secondId)
    expect(store.recentDocumentIds[0]).toBe(secondId)
    store.openDocumentInNewTab(fourthId)
    store.enterSplit('vertical')
    expect(store.splitDocumentIds).toEqual([fourthId, secondId])
  })

  test('closing_the_last_tab_clears_focus_and_rendering', () => {
    const store = workspace()
    store.closeOtherDocumentTabs(firstId)
    store.closeDocumentTab(firstId)
    expect(store.activeTabId).toBeNull()
    expect(store.activeItemId).toBeNull()
    expect(store.renderedDocumentIds).toEqual([])
  })

  test('close_others_exits_and_discards_only_closed_sessions', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await Promise.all([firstId, secondId, thirdId].map((id) => documents.load(id)))
    store.enterSplit('vertical')
    store.closeOtherDocumentTabs(thirdId)
    expect(store.openDocumentIds).toEqual([thirdId])
    expect(store.splitDocumentIds).toEqual([])
    expect(store.splitOrientation).toBeNull()
    expect(store.activeTabId).toBe(thirdId)
    expect([...documents.sessions.keys()]).toEqual([thirdId])
  })

  test('invalid_activation_does_not_change_focus_or_split', () => {
    const store = workspace()
    store.enterSplit('vertical')
    store.activateTab(folderId)
    store.activateTab(fourthId)
    expect(store.activeTabId).toBe(firstId)
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
  })

  test('subtree_document_ids_include_nested_documents_and_exclude_folders', () => {
    const store = workspace()
    store.items.push({ ...items[0]!, id: 'nested', parentId: folderId })
    store.items.find((item) => item.id === secondId)!.parentId = 'nested'
    expect(store.documentIdsInSubtree(folderId)).toEqual([firstId, secondId])
    expect(store.documentIdsInSubtree(firstId)).toEqual([firstId])
    expect(store.documentIdsInSubtree('missing')).toEqual([])
  })

  test.each([firstId, secondId, folderId])('trashing_%s_reconciles_split_focus_and_sessions', async (id) => {
    const store = workspace()
    const documents = useDocumentStore()
    await Promise.all([firstId, secondId, thirdId].map((documentId) => documents.load(documentId)))
    store.enterSplit('vertical')
    vi.spyOn(binderApi, 'trash').mockResolvedValue({ ...items.find((item) => item.id === id)!, trashedAt: stamp })
    await store.trashItem(id)
    const survivor = id === folderId ? thirdId : id === firstId ? secondId : firstId
    expect(store.splitDocumentIds).toEqual([])
    expect(store.splitOrientation).toBeNull()
    expect(store.activeTabId).toBe(survivor)
    expect(store.activeItemId).toBe(survivor)
    expect([...documents.sessions.keys()]).toEqual(id === folderId ? [thirdId] : [firstId, secondId, thirdId].filter((documentId) => documentId !== id))
  })

  test('a_failed_trash_preserves_split_and_sessions', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    store.enterSplit('vertical')
    vi.spyOn(binderApi, 'trash').mockRejectedValue(new Error('Offline'))
    await expect(store.trashItem(firstId)).rejects.toThrow('Offline')
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(documents.sessionFor(firstId)).toBeDefined()
  })

  test('project_change_clears_split_history_and_all_sessions', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    store.enterSplit('vertical')
    vi.spyOn(binderApi, 'getProject').mockResolvedValue({ project: { ...project, id: 'other' }, items: [], trashedItems: [] })
    vi.spyOn(useWritingProgressStore(), 'load').mockResolvedValue()
    await store.load('other')
    expect(store.splitOrientation).toBeNull()
    expect(store.splitDocumentIds).toEqual([])
    expect(store.recentDocumentIds).toEqual([])
    expect(store.activeTabId).toBeNull()
    expect(documents.sessions.size).toBe(0)
  })

  test('same_project_reload_reconciles_removed_split_participants', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    store.enterSplit('vertical')
    vi.spyOn(binderApi, 'getProject').mockResolvedValue({ project, items: items.filter((item) => item.id !== firstId), trashedItems: [] })
    vi.spyOn(useWritingProgressStore(), 'load').mockResolvedValue()
    await store.load(projectId)
    expect(store.splitDocumentIds).toEqual([])
    expect(store.splitOrientation).toBeNull()
    expect(store.activeTabId).toBe(secondId)
    expect(documents.sessionFor(firstId)).toBeUndefined()
  })

  test('same_project_reload_preserves_split_focus_and_loaded_sessions', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    documents.setNotes(firstId, 'Keep this draft')
    store.enterSplit('horizontal')
    store.activateTab(secondId)
    vi.spyOn(binderApi, 'getProject').mockResolvedValue({ project, items: structuredClone(items), trashedItems: [] })
    vi.spyOn(useWritingProgressStore(), 'load').mockResolvedValue()
    await store.load(projectId)
    expect(store.splitDocumentIds).toEqual([firstId, secondId])
    expect(store.splitOrientation).toBe('horizontal')
    expect(store.activeTabId).toBe(secondId)
    expect(documents.sessionFor(firstId)?.notesText).toBe('Keep this draft')
  })

  test('rename_uses_the_keyed_session_and_keeps_its_unsaved_edits', async () => {
    const store = workspace()
    const documents = useDocumentStore()
    await documents.load(firstId)
    documents.setNotes(firstId, 'Unsaved notes')
    await documents.load(secondId)
    const save = vi.spyOn(documentApi, 'save').mockImplementation(async (id, input) => ({ ...documentFixture(id), ...input, revision: 4 }))
    await store.renameItem(firstId, 'Opening')
    expect(save).toHaveBeenCalledWith(firstId, expect.objectContaining({ title: 'Opening', notesText: 'Unsaved notes', expectedRevision: 3 }))
    expect(documentApi.get).toHaveBeenCalledTimes(2)
    expect(documents.sessionFor(firstId)?.title).toBe('Opening')
    expect(documents.sessionFor(firstId)?.isDirty).toBe(false)
    expect(documents.sessionFor(secondId)?.title).toBe(secondId)
    expect(store.items.find((item) => item.id === firstId)?.title).toBe('Opening')
  })
})

describe('split ratio preferences', () => {
  test('defaults_to_evenly_split_panes', () => {
    expect(useWorkspaceStore().splitRatios).toEqual({ vertical: 0.5, horizontal: 0.5 })
  })

  test('persists_independent_ratios_with_existing_pane_preferences', () => {
    const store = useWorkspaceStore()
    store.setSplitRatio('vertical', 0.35)
    store.setSplitRatio('horizontal', 0.65)
    store.setBinderWidth(300)
    setActivePinia(createPinia())
    const reloaded = useWorkspaceStore()
    expect(reloaded.splitRatios).toEqual({ vertical: 0.35, horizontal: 0.65 })
    expect(reloaded.binderWidth).toBe(300)
    expect(JSON.parse(localStorage.getItem(preferenceKey)!)).toMatchObject({ splitRatios: { vertical: 0.35, horizontal: 0.65 } })
  })

  test.each([
    [-1, 0.2], [2, 0.8], [0.2, 0.2], [0.8, 0.8], [Number.NaN, 0.5], [Infinity, 0.5],
  ])('normalizes_ratio_%s_to_%s', (ratio, expected) => {
    const store = useWorkspaceStore()
    store.setSplitRatio('vertical', ratio)
    expect(store.splitRatios).toEqual({ vertical: expected, horizontal: 0.5 })
  })

  test.each([
    [{ vertical: -1, horizontal: 2 }, { vertical: 0.2, horizontal: 0.8 }],
    [{ vertical: '0.4', horizontal: null }, { vertical: 0.5, horizontal: 0.5 }],
    [null, { vertical: 0.5, horizontal: 0.5 }],
  ])('normalizes_persisted_ratios_%j', (splitRatios, expected) => {
    localStorage.setItem(preferenceKey, JSON.stringify({ splitRatios }))
    expect(useWorkspaceStore().splitRatios).toEqual(expected)
  })
})
