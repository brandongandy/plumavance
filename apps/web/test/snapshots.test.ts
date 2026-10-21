import type { DocumentDto, SnapshotDto, SnapshotSummaryDto } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import InspectorPane from '../src/features/inspector/InspectorPane.vue'
import SnapshotCompareDialog from '../src/features/inspector/SnapshotCompareDialog.vue'
import { documentApi } from '../src/api/documents.js'
import { snapshotApi } from '../src/api/snapshots.js'
import { useDocumentStore } from '../src/stores/document.js'
import { wordCountApi } from '../src/api/word-count.js'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'

const documentId = '11111111-1111-4111-8111-111111111111'
const snapshotId = '22222222-2222-4222-8222-222222222222'
const content = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
})

const documentFixture = (text = 'Current saved prose', revision = 2): DocumentDto => ({
  id: documentId,
  projectId: '33333333-3333-4333-8333-333333333333',
  title: 'Chapter',
  contentJson: content(text),
  contentText: text,
  notesText: '',
  revision,
  savedAt: '2026-10-10T00:00:00.000Z',
})
const snapshotFixture: SnapshotDto = {
  id: snapshotId,
  documentId,
  name: 'First pass',
  contentJson: content('Earlier prose'),
  contentText: 'Earlier prose',
  createdAt: '2026-10-10T00:01:00.000Z',
}
const snapshotSummaryFixture: SnapshotSummaryDto = {
  id: snapshotId,
  documentId,
  name: 'First pass',
  wordCount: 2,
  createdAt: '2026-10-10T00:01:00.000Z',
}

afterEach(() => {
  useWritingProgressStore().dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function mountedInspector() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const requests: Array<{ path: string; method: string; body?: unknown }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    requests.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === `/api/documents/${documentId}` && method === 'GET') return Response.json(documentFixture())
    if (path === `/api/documents/${documentId}` && method === 'PUT') return Response.json(documentFixture('Unsaved prose', 3))
    if (path.endsWith('/snapshots') && method === 'GET') return Response.json([snapshotSummaryFixture])
    if (path.endsWith('/snapshots') && method === 'POST') {
      return Response.json({ ...snapshotSummaryFixture, id: '44444444-4444-4444-8444-444444444444', name: 'Milestone' }, { status: 201 })
    }
    if (path.endsWith('/restore')) return Response.json(documentFixture('Earlier prose', 3))
    if (method === 'PATCH') return Response.json({ ...snapshotSummaryFixture, name: 'Renamed' })
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json(snapshotFixture)
  })
  vi.stubGlobal('fetch', fetchMock)
  const store = useDocumentStore()
  await store.load(documentId)
  const wrapper = mount(InspectorPane, {
    attachTo: document.body,
    props: { documentId },
    global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] },
  })
  await wrapper.get('button[role="tab"]:nth-child(2)').trigger('click')
  await flushPromises()
  return { wrapper, store, requests }
}

describe('snapshot inspector', () => {
  test('changing_the_focused_document_closes_dialogs_and_ignores_late_snapshot_details', async () => {
    // Catches stale snapshot previews and confirmation dialogs leaking into the next focused document.
    const { wrapper, store } = await mountedInspector()
    const secondId = '44444444-4444-4444-8444-444444444444'
    let resolveDetail!: (snapshot: SnapshotDto) => void
    vi.spyOn(snapshotApi, 'get').mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve }))
    vi.spyOn(documentApi, 'get').mockResolvedValue({ ...documentFixture(), id: secondId, notesText: 'Second notes' })
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Loading snapshot')
    await store.load(secondId)
    await wrapper.setProps({ documentId: secondId })
    resolveDetail(snapshotFixture)
    await flushPromises()
    expect(document.querySelector('[aria-label="Snapshot preview"]')).toBeNull()
    expect(wrapper.text()).toContain('No snapshots')
    await wrapper.setProps({ documentId })
    await wrapper.get('[aria-label="Restore First pass"]').trigger('click')
    await wrapper.setProps({ documentId: secondId })
    await flushPromises()
    expect(document.querySelector('[aria-label="Confirm restore snapshot"]')).toBeNull()
    wrapper.unmount()
  })

  test('targets_explicit_document_ids_for_snapshot_create_rename_restore_and_delete', async () => {
    setActivePinia(createPinia())
    const secondDocumentId = '44444444-4444-4444-8444-444444444444'
    const createdSnapshot = { ...snapshotSummaryFixture, id: '55555555-5555-4555-8555-555555555555', name: 'Milestone' }
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) => ({ ...documentFixture(), id }))
    vi.spyOn(snapshotApi, 'list').mockImplementation(async (id) => id === documentId ? [snapshotSummaryFixture] : [])
    const create = vi.spyOn(snapshotApi, 'create').mockResolvedValue(createdSnapshot)
    const rename = vi.spyOn(snapshotApi, 'rename').mockResolvedValue({ ...createdSnapshot, name: 'Renamed' })
    const restore = vi.spyOn(snapshotApi, 'restore').mockResolvedValue(documentFixture('Restored prose', 3))
    const remove = vi.spyOn(snapshotApi, 'delete').mockResolvedValue(undefined)
    const store = useDocumentStore()
    await Promise.all([store.load(documentId), store.load(secondDocumentId)])
    await flushPromises()
    store.setTitle(secondDocumentId, 'Second local draft')

    expect(await store.takeSnapshot(documentId, '  Milestone  ')).toBe(true)
    expect(create).toHaveBeenCalledWith(documentId, 'Milestone')
    await store.renameSnapshot(documentId, createdSnapshot.id, '  Renamed  ')
    expect(rename).toHaveBeenCalledWith(createdSnapshot.id, 'Renamed')
    expect(store.sessionFor(documentId)?.snapshots[0]?.name).toBe('Renamed')
    expect(await store.restoreSnapshot(documentId, createdSnapshot.id)).toBe(true)
    expect(restore).toHaveBeenCalledWith(createdSnapshot.id, 2)
    expect(store.sessionFor(documentId)?.contentText).toBe('Restored prose')
    await store.deleteSnapshot(documentId, createdSnapshot.id)
    expect(remove).toHaveBeenCalledWith(createdSnapshot.id)
    expect(store.sessionFor(documentId)?.snapshots).toEqual([snapshotSummaryFixture])
    expect(store.sessionFor(secondDocumentId)?.title).toBe('Second local draft')
    expect(store.sessionFor(secondDocumentId)?.snapshots).toEqual([])
    expect(store.sessionFor(secondDocumentId)?.isDirty).toBe(true)
  })

  test('snapshot_detail_requests_for_different_documents_do_not_invalidate_each_other', async () => {
    setActivePinia(createPinia())
    const secondDocumentId = '44444444-4444-4444-8444-444444444444'
    const secondSnapshot = { ...snapshotFixture, id: '55555555-5555-4555-8555-555555555555', documentId: secondDocumentId }
    let resolveFirst: ((snapshot: SnapshotDto) => void) | undefined
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) => ({ ...documentFixture(), id }))
    vi.spyOn(snapshotApi, 'list').mockImplementation(async (id) => id === documentId
      ? [snapshotSummaryFixture]
      : [{ ...snapshotSummaryFixture, id: secondSnapshot.id, documentId: secondDocumentId }])
    vi.spyOn(snapshotApi, 'get').mockImplementation((id) => id === snapshotId
      ? new Promise((resolve) => { resolveFirst = resolve })
      : Promise.resolve(secondSnapshot))
    const store = useDocumentStore()
    await Promise.all([store.load(documentId), store.load(secondDocumentId)])
    await flushPromises()
    const firstDetail = store.loadSnapshotDetail(documentId, snapshotId)
    await expect(store.loadSnapshotDetail(secondDocumentId, secondSnapshot.id)).resolves.toEqual(secondSnapshot)
    resolveFirst?.(snapshotFixture)
    await expect(firstDetail).resolves.toEqual(snapshotFixture)
    expect(store.sessionFor(documentId)?.errorMessage).toBe('')
    expect(store.sessionFor(secondDocumentId)?.errorMessage).toBe('')
  })

  async function progressForDocument(): Promise<ReturnType<typeof useWritingProgressStore>> {
    vi.spyOn(wordCountApi, 'getProgress').mockResolvedValueOnce({
      projectWordCount: 1000, dailyWordCount: 10, localDate: new Date().toLocaleDateString('en-CA'),
      projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions',
    }).mockRejectedValue(new Error('Progress unavailable'))
    const progress = useWritingProgressStore()
    await progress.load(documentFixture().projectId)
    return progress
  }

  test.each([
    ['Unsaved prose', 2, 999],
    ['one two three four', 4, 1001],
  ])('keeps the saved aggregate for %s when normal save succeeds and progress reconciliation fails', async (text, words, total) => {
    const { store, wrapper } = await mountedInspector()
    const progress = await progressForDocument()
    vi.spyOn(documentApi, 'save').mockResolvedValue(documentFixture(text, 3))
    store.setContent(documentId, content(text))
    expect(progress.liveProjectWordCount(store.sessionFor(documentId)!.counts.words, store.sessionFor(documentId)!.savedWordCount)).toBe(total)
    await store.save(documentId)
    await progress.refresh()
    expect(store.sessionFor(documentId)!.savedWordCount).toBe(words)
    expect(progress.liveProjectWordCount(store.sessionFor(documentId)!.counts.words, store.sessionFor(documentId)!.savedWordCount)).toBe(total)
    expect(progress.dailyWordCount).toBe(10)
    wrapper.unmount()
  })

  test('accounts for Save and Take Snapshot without relying on the workspace Save button', async () => {
    const { store, wrapper } = await mountedInspector()
    const progress = await progressForDocument()
    store.setContent(documentId, content('Unsaved prose'))
    await wrapper.get('button[aria-label="Take snapshot"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Save and take snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(store.sessionFor(documentId)!.isDirty).toBe(false)
    expect(progress.liveProjectWordCount(store.sessionFor(documentId)!.counts.words, store.sessionFor(documentId)!.savedWordCount)).toBe(999)
    expect(progress.dailyWordCount).toBe(10)
    wrapper.unmount()
  })

  test('accounts for a restored saved snapshot without counting it as daily activity', async () => {
    const { store, wrapper } = await mountedInspector()
    const progress = await progressForDocument()
    await wrapper.get('button[aria-label="Restore First pass"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Confirm restore snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(store.sessionFor(documentId)!.contentText).toBe('Earlier prose')
    expect(progress.liveProjectWordCount(store.sessionFor(documentId)!.counts.words, store.sessionFor(documentId)!.savedWordCount)).toBe(999)
    expect(progress.dailyWordCount).toBe(10)
    wrapper.unmount()
  })

  test('preserves_edits_made_during_snapshot_restoration_and_updates_the_saved_baseline', async () => {
    setActivePinia(createPinia())
    let resolveRestore: ((document: DocumentDto) => void) | undefined
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([snapshotSummaryFixture])
    vi.spyOn(snapshotApi, 'restore').mockImplementation(() => new Promise((resolve) => { resolveRestore = resolve }))
    const store = useDocumentStore()
    await store.load(documentId)
    await flushPromises()

    const restoring = store.restoreSnapshot(documentId, snapshotId)
    store.setTitle(documentId, 'Title written during restore')
    store.setContent(documentId, content('New writing during restore'))
    store.setNotes(documentId, 'Notes written during restore')
    resolveRestore?.({
      ...documentFixture('Earlier prose', 3),
      title: 'Restored title',
      notesText: 'Restored notes',
      savedAt: '2026-10-10T00:05:00.000Z',
    })

    expect(await restoring).toBe(true)
    const session = store.sessionFor(documentId)!
    expect(session.title).toBe('Title written during restore')
    expect(session.contentText).toBe('New writing during restore')
    expect(session.notesText).toBe('Notes written during restore')
    expect(session.revision).toBe(3)
    expect(session.savedAt).toBe('2026-10-10T00:05:00.000Z')
    expect(session.savedWordCount).toBe(2)
    expect(session.counts.words).toBe(4)
    expect(session.saveState).toBe('unsaved')
    expect(session.isDirty).toBe(true)

    store.setTitle(documentId, 'Restored title')
    store.setContent(documentId, content('Earlier prose'))
    store.setNotes(documentId, 'Restored notes')
    expect(session.isDirty).toBe(false)
  })

  test('accepts_snapshot_summaries_without_content_bodies', async () => {
    const { wrapper, store } = await mountedInspector()

    expect(store.sessionFor(documentId)!.snapshots).toEqual([snapshotSummaryFixture])
    expect(wrapper.text()).toContain('2 words')
  })

  test('creates_only_on_explicit_take_and_requires_saving_a_dirty_buffer_first', async () => {
    const { wrapper, store, requests } = await mountedInspector()
    expect(wrapper.text()).toContain('First pass')
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)

    store.setContent(documentId, content('Unsaved prose'))
    const trigger = wrapper.get('button[aria-label="Take snapshot"]')
    await trigger.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Save before taking a snapshot')
    const name = document.querySelector<HTMLInputElement>('input[aria-label="Snapshot name"]') as HTMLInputElement
    name.value = '  Milestone  '
    name.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.querySelector('button[aria-label="Save and take snapshot"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1)
    expect(requests.filter((request) => request.method === 'POST')).toEqual([
      expect.objectContaining({ body: { name: 'Milestone' } }),
    ])
    expect(wrapper.text()).toContain('Milestone')
    expect(document.activeElement).toBe(trigger.element)
  })

  test('previews_compares_renames_restores_and_deletes_with_confirmation', async () => {
    const { wrapper, store, requests } = await mountedInspector()
    await wrapper.get('button[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('[aria-label="Snapshot preview"]')?.textContent).toContain('Earlier prose')
    ;(document.querySelector('button[aria-label="Close snapshot preview"]') as HTMLButtonElement).click()
    await flushPromises()

    await wrapper.get('button[aria-label="Compare First pass"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Removed: Earlier')
    expect(document.body.textContent).toContain('Added: Current')
    expect(document.body.textContent).toContain('Added: saved')
    ;(document.querySelector('button[aria-label="Close snapshot comparison"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(requests.filter((request) => request.path === `/api/snapshots/${snapshotId}`)).toHaveLength(2)

    await wrapper.get('button[aria-label="Restore First pass"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Confirm restore snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(store.sessionFor(documentId)!.contentText).toBe('Earlier prose')
    expect(requests.filter((request) => request.path === `/api/snapshots/${snapshotId}`)).toHaveLength(2)

    await wrapper.get('button[aria-label="Delete First pass"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Confirm delete snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)
    expect(requests.filter((request) => request.path === `/api/snapshots/${snapshotId}` && request.method === 'GET')).toHaveLength(2)
  })

  test('retains_snapshot_detail_for_its_session_after_loading_another_document', async () => {
    setActivePinia(createPinia())
    const secondDocumentId = '44444444-4444-4444-8444-444444444444'
    let resolveDetail: ((snapshot: SnapshotDto) => void) | undefined
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) => ({ ...documentFixture(), id }))
    vi.spyOn(snapshotApi, 'list').mockImplementation(async (id) =>
      id === documentId ? [snapshotSummaryFixture] : [],
    )
    vi.spyOn(snapshotApi, 'get').mockImplementation(
      () => new Promise((resolve) => { resolveDetail = resolve }),
    )
    const store = useDocumentStore()
    await store.load(documentId)
    await vi.waitFor(() => expect(store.sessionFor(documentId)!.snapshots).toHaveLength(1))

    const detail = store.loadSnapshotDetail(documentId, snapshotId)
    await store.load(secondDocumentId)
    resolveDetail?.(snapshotFixture)

    await expect(detail).resolves.toEqual(snapshotFixture)
    expect(store.sessionFor(secondDocumentId)?.snapshots).toEqual([])
  })

  test('a_late_snapshot_list_updates_only_its_matching_session', async () => {
    setActivePinia(createPinia())
    const secondDocumentId = '44444444-4444-4444-8444-444444444444'
    let resolveFirst: ((snapshots: SnapshotSummaryDto[]) => void) | undefined
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) => ({ ...documentFixture(), id }))
    const secondSnapshot = { ...snapshotSummaryFixture, id: '55555555-5555-4555-8555-555555555555', documentId: secondDocumentId, name: 'Second snapshot' }
    vi.spyOn(snapshotApi, 'list').mockImplementation((id) => id === documentId
      ? new Promise((resolve) => { resolveFirst = resolve })
      : Promise.resolve([secondSnapshot]))
    const store = useDocumentStore()
    await Promise.all([store.load(documentId), store.load(secondDocumentId)])
    resolveFirst?.([snapshotSummaryFixture])
    await flushPromises()
    expect(store.sessionFor(documentId)?.snapshots).toEqual([snapshotSummaryFixture])
    expect(store.sessionFor(secondDocumentId)?.snapshots).toEqual([secondSnapshot])
  })

  test('an_older_snapshot_list_cannot_replace_a_newer_list_for_the_same_document', async () => {
    setActivePinia(createPinia())
    let resolveOld: ((snapshots: SnapshotSummaryDto[]) => void) | undefined
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    vi.spyOn(snapshotApi, 'list')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValue([{ ...snapshotSummaryFixture, name: 'Newest list' }])
    const store = useDocumentStore()
    await store.load(documentId)
    await store.loadSnapshots(documentId)
    resolveOld?.([snapshotSummaryFixture])
    await flushPromises()
    expect(store.sessionFor(documentId)?.snapshots[0]?.name).toBe('Newest list')
  })

  test('discard_invalidates_pending_snapshot_operations_for_a_reopened_session', async () => {
    setActivePinia(createPinia())
    let resolveDetail: ((snapshot: SnapshotDto) => void) | undefined
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([snapshotSummaryFixture])
    vi.spyOn(snapshotApi, 'get').mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve }))
    const store = useDocumentStore()
    await store.load(documentId)
    await flushPromises()
    const pending = store.loadSnapshotDetail(documentId, snapshotId)
    store.discard(documentId)
    await store.load(documentId)
    resolveDetail?.(snapshotFixture)
    await expect(pending).resolves.toBeUndefined()
  })

  test('an_older_snapshot_failure_cannot_replace_a_successful_retry', async () => {
    const { wrapper, store } = await mountedInspector()
    const pending: Array<{
      resolve: (snapshot: SnapshotDto) => void
      reject: (error: Error) => void
    }> = []
    vi.spyOn(snapshotApi, 'get').mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    )

    await wrapper.get('button[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Loading snapshot…')
    ;(document.querySelector('button[aria-label="Close snapshot preview"]') as HTMLButtonElement).click()
    await flushPromises()

    await wrapper.get('button[aria-label="Preview First pass"]').trigger('click')
    pending[1]?.resolve(snapshotFixture)
    await flushPromises()
    expect(document.querySelector('[aria-label="Snapshot preview"]')?.textContent).toContain('Earlier prose')

    pending[0]?.reject(new Error('Older request failed'))
    await flushPromises()
    const preview = document.querySelector('[aria-label="Snapshot preview"]')
    expect(preview).not.toBeNull()
    expect(preview?.textContent).toContain('Earlier prose')
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(store.sessionFor(documentId)!.errorMessage).toBe('')
  })

  test('renders_an_accessible_readable_comparison', async () => {
    const wrapper = mount(SnapshotCompareDialog, {
      attachTo: document.body,
      props: { visible: true, currentText: 'New text', snapshotText: 'Old text' },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    await flushPromises()
    expect(document.body.querySelector('del')).toBeTruthy()
    expect(document.body.querySelector('ins')).toBeTruthy()
    expect(document.body.textContent).toContain('Removed: Old')
    wrapper.unmount()
  })
})
