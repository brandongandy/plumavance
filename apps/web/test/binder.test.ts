import type { BinderItemDto } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import BinderTree from '../src/features/binder/BinderTree.vue'
import { createMoveIntent } from '../src/features/binder/useBinderMove.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'
import { useDocumentStore } from '../src/stores/document.js'
import { UnsavedGuardKey } from '../src/composables/useUnsavedGuard.js'
import { binderApi } from '../src/api/binder.js'
import { documentApi } from '../src/api/documents.js'
import { snapshotApi } from '../src/api/snapshots.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const folderId = '22222222-2222-4222-8222-222222222222'
const chapterId = '33333333-3333-4333-8333-333333333333'
const notesId = '44444444-4444-4444-8444-444444444444'

const stamp = '2026-10-10T00:00:00.000Z'
const item = (
  id: string,
  title: string,
  kind: BinderItemDto['kind'],
  parentId: string | null,
  position: number,
): BinderItemDto => ({
  id,
  projectId,
  parentId,
  kind,
  title,
  position,
  trashedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
})

const originalItems = [
  item(folderId, 'Manuscript', 'folder', null, 0),
  item(chapterId, 'Chapter One', 'document', folderId, 0),
  item(notesId, 'Research Notes', 'document', null, 1),
]

async function mountTree(canTransition = () => true): Promise<{ wrapper: VueWrapper; store: ReturnType<typeof useWorkspaceStore> }> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkspaceStore()
  store.$patch({ projectId, items: structuredClone(originalItems), activeItemId: chapterId })
  const wrapper = mount(BinderTree, {
    attachTo: document.body,
    global: {
      plugins: [pinia, [PrimeVue, { unstyled: true }]],
      provide: { [UnsavedGuardKey as symbol]: { canTransition, runGuarded: (action: () => unknown) => canTransition() ? action() : undefined } },
    },
  })
  await flushPromises()
  return { wrapper, store }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('binder tree', () => {
  test('implements_arrow_home_end_enter_and_typeahead_tree_navigation', async () => {
    const { wrapper, store } = await mountTree()
    const chapter = wrapper.get(`[data-item-id="${chapterId}"]`)
    ;(chapter.element as HTMLElement).focus()

    await chapter.trigger('keydown', { key: 'ArrowDown' })
    expect((document.activeElement as HTMLElement).dataset.itemId).toBe(notesId)
    await wrapper.get(`[data-item-id="${notesId}"]`).trigger('keydown', { key: 'Home' })
    expect((document.activeElement as HTMLElement).dataset.itemId).toBe(folderId)
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('keydown', { key: 'End' })
    expect((document.activeElement as HTMLElement).dataset.itemId).toBe(notesId)
    await wrapper.get(`[data-item-id="${notesId}"]`).trigger('keydown', { key: 'm' })
    expect((document.activeElement as HTMLElement).dataset.itemId).toBe(folderId)
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('keydown', { key: 'Enter' })
    expect(store.activeItemId).toBe(folderId)
  })

  test('supports_inline_rename_and_title_search', async () => {
    vi.useFakeTimers()
    const { wrapper, store } = await mountTree()
    const search = vi.spyOn(store, 'search').mockImplementation(async () => {
      store.searchResults = [{ id: notesId, title: 'Research Notes', excerpt: '' }]
    })
    vi.spyOn(store, 'renameItem').mockImplementation(async (id, title) => {
      store.items = store.items.map((candidate) =>
        candidate.id === id ? { ...candidate, title } : candidate,
      )
    })

    await wrapper.get(`[data-item-id="${chapterId}"]`).trigger('keydown', { key: 'F2' })
    const input = wrapper.get('input[aria-label="Rename Chapter One"]')
    await input.setValue('Opening')
    await input.trigger('keydown', { key: 'Enter' })
    expect(store.renameItem).toHaveBeenCalledWith(chapterId, 'Opening')

    await wrapper.get('input[aria-label="Search binder"]').setValue('research')
    await vi.advanceTimersByTimeAsync(250)
    expect(search).toHaveBeenCalledWith('research', expect.any(AbortSignal))
    expect(wrapper.find(`[data-item-id="${folderId}"]`).exists()).toBe(false)
    expect(wrapper.get(`[data-item-id="${notesId}"]`).text()).toContain('Research Notes')
  })

  test('maps_pointer_and_keyboard_moves_to_the_same_payload_shape', () => {
    expect(createMoveIntent(chapterId, null, 1)).toEqual({ itemId: chapterId, parentId: null, index: 1 })
    expect(createMoveIntent(chapterId, folderId, 0)).toEqual({
      itemId: chapterId,
      parentId: folderId,
      index: 0,
    })
  })

  test('reorders_with_keyboard_and_rolls_back_a_rejected_move', async () => {
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.$patch({ projectId, items: structuredClone(originalItems), activeItemId: notesId })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'MOVE_REJECTED', message: 'Move rejected.' }, { status: 409 })),
    )

    await expect(store.moveItem(createMoveIntent(notesId, null, 0))).rejects.toThrow('Move rejected.')
    expect(store.items).toEqual(originalItems)
    expect(store.errorMessage).toBe('Move rejected.')
  })

  test('exposes_keyboard_reparent_and_trash_restore_delete_actions', async () => {
    const { wrapper, store } = await mountTree()
    vi.spyOn(store, 'moveItem').mockResolvedValue()
    vi.spyOn(store, 'trashItem').mockResolvedValue()
    vi.spyOn(store, 'restoreItem').mockResolvedValue()
    vi.spyOn(store, 'deleteItem').mockResolvedValue()

    const notes = wrapper.get(`[data-item-id="${notesId}"]`)
    await notes.trigger('keydown', { key: 'ArrowRight', altKey: true })
    expect(store.moveItem).toHaveBeenCalledWith({ itemId: notesId, parentId: folderId, index: 1 })
    await notes.trigger('keydown', { key: 'Delete' })
    expect(store.trashItem).toHaveBeenCalledWith(notesId)

    store.trashedItems = [{ ...originalItems[2]!, trashedAt: stamp }]
    await flushPromises()
    await wrapper.get(`button[aria-label="Restore Research Notes"]`).trigger('click')
    await wrapper.get(`button[aria-label="Permanently delete Research Notes"]`).trigger('click')
    await wrapper.get(`button[aria-label="Confirm delete Research Notes"]`).trigger('click')
    expect(store.restoreItem).toHaveBeenCalledWith(notesId)
    expect(store.deleteItem).toHaveBeenCalledWith(notesId)
  })

  test('does_not_restore_trash_when_the_unsaved_guard_declines', async () => {
    const { wrapper, store } = await mountTree(() => false)
    const restore = vi.spyOn(store, 'restoreItem').mockResolvedValue()
    store.trashedItems = [{ ...originalItems[2]!, trashedAt: stamp }]
    await flushPromises()

    await wrapper.get(`button[aria-label="Restore Research Notes"]`).trigger('click')

    expect(restore).not.toHaveBeenCalled()
  })

  test('toggles_folders_with_a_disclosure_button_and_drops_inside_them', async () => {
    const { wrapper, store } = await mountTree()
    const move = vi.spyOn(store, 'moveItem').mockResolvedValue()
    const disclosure = wrapper.get(`button[aria-label="Collapse Manuscript"]`)
    await disclosure.trigger('click')
    expect(wrapper.find(`[data-item-id="${chapterId}"]`).exists()).toBe(false)
    await wrapper.get(`button[aria-label="Expand Manuscript"]`).trigger('click')

    const folder = wrapper.get(`[data-item-id="${folderId}"]`)
    vi.spyOn(folder.element, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 30, height: 30, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) })
    await folder.trigger('drop', {
      clientY: 15,
      dataTransfer: { getData: () => notesId },
    })
    expect(move).toHaveBeenCalledWith({ itemId: notesId, parentId: folderId, index: 1 })
  })

  test('renames_the_open_document_through_its_revisioned_save_without_losing_edits', async () => {
    setActivePinia(createPinia())
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    workspace.$patch({ projectId, items: structuredClone(originalItems), activeItemId: chapterId })
    const current = {
      id: chapterId, projectId, title: 'Chapter One', contentJson: { type: 'doc' as const, content: [{ type: 'paragraph' as const }] },
      contentText: '', notesText: '', revision: 3, savedAt: stamp,
    }
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockResolvedValue(current)
    const save = vi.spyOn(documentApi, 'save').mockImplementation(async (_id, input) => ({ ...current, ...input, contentText: 'Changed', revision: 4 }))
    await documents.load(chapterId)
    documents.setNotes('Unsaved note')

    await workspace.renameItem(chapterId, 'Opening')

    expect(save).toHaveBeenCalledWith(chapterId, expect.objectContaining({ title: 'Opening', notesText: 'Unsaved note', expectedRevision: 3 }))
    expect(documents.title).toBe('Opening')
    expect(documents.revision).toBe(4)
    expect(workspace.items.find((candidate) => candidate.id === chapterId)?.title).toBe('Opening')
  })

  test('ignores_search_results_from_a_superseded_query', async () => {
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.$patch({ projectId, items: structuredClone(originalItems) })
    let resolveOld: ((value: Awaited<ReturnType<typeof binderApi.search>>) => void) | undefined
    vi.spyOn(binderApi, 'search').mockImplementation((_project, query) => query === 'old'
      ? new Promise((resolve) => { resolveOld = resolve })
      : Promise.resolve([{ id: notesId, title: 'Research Notes', excerpt: 'new match' }]))

    const oldSearch = store.search('old')
    await store.search('new')
    resolveOld?.([{ id: chapterId, title: 'Chapter One', excerpt: 'old match' }])
    await oldSearch

    expect(store.searchResults).toEqual([{ id: notesId, title: 'Research Notes', excerpt: 'new match' }])
  })
})
