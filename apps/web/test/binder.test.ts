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
const appendixId = '55555555-5555-4555-8555-555555555555'

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
const wrappers: VueWrapper[] = []

async function mountTree(canDiscard: (ids?: readonly string[]) => boolean = () => true): Promise<{ wrapper: VueWrapper; store: ReturnType<typeof useWorkspaceStore> }> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkspaceStore()
  store.$patch({ projectId, items: structuredClone(originalItems), activeItemId: chapterId })
  const wrapper = mount(BinderTree, {
    attachTo: document.body,
    global: {
      plugins: [pinia, [PrimeVue, { unstyled: true }]],
      provide: { [UnsavedGuardKey as symbol]: { canDiscard, runGuarded: (action: () => unknown, ids?: readonly string[]) => canDiscard(ids) ? action() : undefined } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, store }
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('binder tree', () => {
  test('shows_tooltips_for_every_binder_toolbar_button', async () => {
    const { wrapper } = await mountTree()
    const cases = [
      ['New folder', 'New folder'],
      ['New document', 'New document'],
      ['Rename selected item', 'Rename selected item (F2)'],
      ['Move selected item to Trash', 'Move selected item to Trash (Delete)'],
    ] as const

    for (const [buttonLabel, tooltip] of cases) {
      const button = wrapper.get(`button[aria-label="${buttonLabel}"]`)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[role="tooltip"]').text()).toBe(tooltip)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseleave'))
      await wrapper.vm.$nextTick()
    }
  })

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

  test('opens_a_document_in_a_new_tab_from_its_row_action', async () => {
    // Catches the row action selecting/replacing the current tab or appearing on folders.
    const { wrapper, store } = await mountTree()
    store.$patch({ openDocumentIds: [chapterId], activeTabId: chapterId })

    expect(wrapper.find('button[aria-label="Open Manuscript in new tab"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="Open Research Notes in new tab"]').trigger('click')

    expect(store.openDocumentIds).toEqual([chapterId, notesId])
    expect(store.activeTabId).toBe(notesId)
    expect(store.activeItemId).toBe(notesId)
  })

  test('keyboard_activation_of_the_new_tab_action_does_not_select_the_row_first', async () => {
    // Catches Enter bubbling to the treeitem and replacing the active tab before the button click.
    const canTransition = vi.fn(() => true)
    const { wrapper, store } = await mountTree(canTransition)
    store.$patch({ openDocumentIds: [chapterId], activeTabId: chapterId })
    const button = wrapper.get('button[aria-label="Open Research Notes in new tab"]')

    await button.trigger('keydown', { key: 'Enter' })
    await button.trigger('click')

    expect(store.openDocumentIds).toEqual([chapterId, notesId])
    expect(canTransition).not.toHaveBeenCalled()
  })

  test('keeps_focus_in_the_rename_input_while_typing_a_title', async () => {
    const { wrapper, store } = await mountTree()
    const rename = vi.spyOn(store, 'renameItem').mockResolvedValue()

    await wrapper.get(`[data-item-id="${chapterId}"]`).trigger('keydown', { key: 'F2' })
    await flushPromises()
    const input = wrapper.get('input[aria-label="Rename Chapter One"]')
    ;(input.element as HTMLInputElement).focus()
    expect(document.activeElement).toBe(input.element)

    await input.setValue('Opening')
    await input.trigger('keydown', { key: 'r' })
    await flushPromises()

    expect(wrapper.get('input[aria-label="Rename Chapter One"]').element).toBe(document.activeElement)
    expect(rename).not.toHaveBeenCalled()
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

  test('trashing_the_active_document_selects_the_nearest_remaining_tab', async () => {
    // Catches trash reconciliation selecting the first Binder item instead of the right-hand tab.
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    const appendix = item(appendixId, 'Appendix', 'document', null, 2)
    store.$patch({
      projectId,
      items: [...structuredClone(originalItems), appendix],
      activeItemId: notesId,
      openDocumentIds: [chapterId, notesId, appendixId],
      activeTabId: notesId,
    })
    vi.spyOn(binderApi, 'trash').mockResolvedValue({ ...originalItems[2]!, trashedAt: stamp })

    await store.trashItem(notesId)

    expect(store.openDocumentIds).toEqual([chapterId, appendixId])
    expect(store.activeTabId).toBe(appendixId)
    expect(store.activeItemId).toBe(appendixId)
  })

  test('restoring_an_item_does_not_reopen_a_document_after_the_last_tab_was_closed', async () => {
    // Catches restore selecting a document that has no corresponding open tab.
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.$patch({
      projectId,
      items: [originalItems[0]!],
      trashedItems: [{ ...originalItems[2]!, trashedAt: stamp }],
      activeItemId: null,
      openDocumentIds: [],
      activeTabId: null,
    })
    vi.spyOn(binderApi, 'restore').mockResolvedValue(originalItems[2]!)
    vi.spyOn(binderApi, 'getProject').mockResolvedValue({
      project: {
        id: projectId,
        name: 'Draft',
        createdAt: stamp,
        updatedAt: stamp,
        lastOpenedAt: stamp,
        projectWordTarget: null,
        dailyWordTarget: null,
        dailyCountMode: 'additions',
      },
      items: structuredClone(originalItems),
      trashedItems: [],
    })

    await store.restoreItem(notesId)

    expect(store.openDocumentIds).toEqual([])
    expect(store.activeTabId).toBeNull()
    expect(store.activeItemId).toBeNull()
  })

  test('restores_trash_without_a_discard_prompt_because_no_session_is_removed', async () => {
    const { wrapper, store } = await mountTree(() => false)
    const restore = vi.spyOn(store, 'restoreItem').mockResolvedValue()
    store.trashedItems = [{ ...originalItems[2]!, trashedAt: stamp }]
    await flushPromises()

    await wrapper.get(`button[aria-label="Restore Research Notes"]`).trigger('click')

    expect(restore).toHaveBeenCalledWith(notesId)
  })

  test('guards_only_the_replaced_tab_and_all_documents_in_a_trashed_subtree', async () => {
    // Catches global guards blocking unrelated edits and subtree trash silently dropping descendants.
    const canDiscard = vi.fn((ids?: readonly string[]) => !ids?.includes(chapterId))
    const { wrapper, store } = await mountTree(canDiscard)
    store.$patch({ openDocumentIds: [chapterId], activeTabId: chapterId })
    await wrapper.get(`[data-item-id="${notesId}"]`).trigger('click')
    expect(canDiscard).toHaveBeenLastCalledWith([chapterId])
    expect(store.openDocumentIds).toEqual([chapterId])
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('click')
    expect(store.activeItemId).toBe(folderId)
    const trash = vi.spyOn(binderApi, 'trash')
    await wrapper.get('[aria-label="Move selected item to Trash"]').trigger('click')
    expect(canDiscard).toHaveBeenLastCalledWith([chapterId])
    expect(trash).not.toHaveBeenCalled()
    expect(store.items.some((candidate) => candidate.id === chapterId)).toBe(true)
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
    documents.setNotes(chapterId, 'Unsaved note')

    await workspace.renameItem(chapterId, 'Opening')

    expect(save).toHaveBeenCalledWith(chapterId, expect.objectContaining({ title: 'Opening', notesText: 'Unsaved note', expectedRevision: 3 }))
    expect(documents.sessionFor(chapterId)?.title).toBe('Opening')
    expect(documents.sessionFor(chapterId)?.revision).toBe(4)
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
