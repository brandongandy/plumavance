import type { DocumentDto, EditorDocument } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import DocumentEditor from '../src/features/editor/DocumentEditor.vue'
import SaveStatus from '../src/features/editor/SaveStatus.vue'
import { documentApi } from '../src/api/documents.js'
import { ApiRequestError } from '../src/api/client.js'
import { snapshotApi } from '../src/api/snapshots.js'
import { countText, editorText } from '../src/features/editor/counts.js'
import { documentExtensions } from '../src/features/editor/documentExtensions.js'
import { useDocumentStore } from '../src/stores/document.js'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'

const emptyContent: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
const proseContent: EditorDocument = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A Beginning' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Quiet ', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'words.' },
      ],
    },
  ],
}

function documentFixture(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: firstId,
    projectId: '33333333-3333-4333-8333-333333333333',
    title: 'Chapter One',
    contentJson: emptyContent,
    contentText: '',
    notesText: '',
    revision: 0,
    savedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('document editor state', () => {
  test.each([true, false])('pending_write_discard_risk_clears_after_save_success_%s', async (succeeds) => {
    setActivePinia(createPinia())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    let finish!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((_id, payload) => new Promise((resolve, reject) => {
      finish = () => succeeds ? resolve(documentFixture({ ...payload, revision: 1 })) : reject(new Error('Save failed'))
    }))
    const store = useDocumentStore()
    await store.load(firstId)
    const unchangedSave = store.save(firstId)
    expect(store.hasDirtySessions()).toBe(false)
    finish()
    await unchangedSave
    store.setNotes(firstId, 'Submitted notes')
    const saving = store.save(firstId)
    store.setNotes(firstId, '')
    expect(store.sessionFor(firstId)?.isDirty).toBe(false)
    expect(store.hasDirtySessions()).toBe(true)
    finish()
    expect(await saving).toBe(succeeds)
    expect(store.hasDirtySessions()).toBe(succeeds)
    if (succeeds) {
      store.setNotes(firstId, 'Submitted notes')
      expect(store.hasDirtySessions()).toBe(false)
    }
  })

  test('keeps_two_document_sessions_editable_and_saveable_independently', async () => {
    setActivePinia(createPinia())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) => documentFixture({ id }))
    vi.spyOn(documentApi, 'save').mockImplementation(async (id, payload) =>
      documentFixture({ id, ...payload, revision: 1 }),
    )
    const store = useDocumentStore()
    await Promise.all([store.load(firstId), store.load(secondId)])
    store.setTitle(firstId, 'First draft')
    store.setTitle(secondId, 'Second draft')
    expect(store.dirtyDocumentIds()).toEqual([firstId, secondId])
    expect(store.dirtyDocumentIds([secondId, 'missing', firstId])).toEqual([secondId, firstId])
    expect(store.hasDirtySessions([secondId])).toBe(true)
    expect(store.hasDirtySessions(['missing'])).toBe(false)
    await store.save(firstId)
    expect(store.sessionFor(firstId)?.isDirty).toBe(false)
    expect(store.sessionFor(secondId)?.title).toBe('Second draft')
    expect(store.sessionFor(secondId)?.isDirty).toBe(true)
  })

  test('isolates_a_conflict_and_late_response_to_the_matching_session', async () => {
    setActivePinia(createPinia())
    let resolveFirst: ((value: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockImplementation((id) => id === firstId
      ? new Promise((resolve) => { resolveFirst = resolve })
      : Promise.resolve(documentFixture({ id })))
    vi.spyOn(documentApi, 'save').mockRejectedValue(new ApiRequestError(409, {
      code: 'DOCUMENT_CONFLICT', message: 'Changed elsewhere.',
      details: { currentRevision: 3, savedAt: 'later' },
    }))
    const store = useDocumentStore()
    const firstLoad = store.load(firstId)
    await store.load(secondId)
    store.setTitle(secondId, 'Local second')
    await store.save(secondId)
    resolveFirst?.(documentFixture({ title: 'First from server' }))
    await firstLoad
    expect(store.sessionFor(firstId)?.title).toBe('First from server')
    expect(store.sessionFor(secondId)?.saveState).toBe('conflict')
    expect(store.sessionFor(firstId)?.saveState).not.toBe('conflict')
  })

  test('retains_cached_edits_and_scroll_until_an_explicit_forced_reload', async () => {
    setActivePinia(createPinia())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    const get = vi.spyOn(documentApi, 'get').mockImplementation(async (id) => documentFixture({ id }))
    const store = useDocumentStore()
    await Promise.all([store.load(firstId), store.load(secondId)])
    store.setTitle(firstId, 'Local title')
    store.setScrollTop(firstId, 210)
    store.setScrollTop(secondId, 45)
    await store.load(firstId)
    expect(get).toHaveBeenCalledTimes(2)
    expect(store.sessionFor(firstId)?.title).toBe('Local title')
    expect(store.sessionFor(firstId)?.scrollTop).toBe(210)
    expect(store.sessionFor(secondId)?.scrollTop).toBe(45)
    expect(store.sessionFor(secondId)?.isDirty).toBe(false)
    await store.reloadServerCopy(firstId)
    expect(store.sessionFor(firstId)?.title).toBe('Chapter One')
    expect(store.sessionFor(firstId)?.isDirty).toBe(false)
  })

  test.each(['discard', 'clear'] as const)('%s_invalidates_pending_loads_even_when_the_id_is_reopened', async (action) => {
    setActivePinia(createPinia())
    let resolveFirst: ((value: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValue(documentFixture({ title: 'Reopened' }))
    const store = useDocumentStore()
    const pending = store.load(firstId)
    if (action === 'discard') store.discard(firstId)
    else store.clear()
    expect(store.sessionFor(firstId)).toBeUndefined()
    await store.load(firstId)
    resolveFirst?.(documentFixture({ title: 'Stale' }))
    expect(await pending).toBe(false)
    expect(store.sessionFor(firstId)?.title).toBe('Reopened')
    expect(store.hasDirtySessions()).toBe(false)
  })

  test('a_forced_reload_invalidates_an_older_save_without_overwriting_newer_edits', async () => {
    setActivePinia(createPinia())
    let resolveSave: ((value: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    vi.spyOn(documentApi, 'save').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const store = useDocumentStore()
    await store.load(firstId)
    store.setTitle(firstId, 'Old save')
    const pending = store.save(firstId)
    await store.load(firstId, true)
    store.setTitle(firstId, 'New local edit')
    resolveSave?.(documentFixture({ title: 'Old save', revision: 1 }))
    expect(await pending).toBe(false)
    expect(store.sessionFor(firstId)?.title).toBe('New local edit')
    expect(store.sessionFor(firstId)?.revision).toBe(0)
  })

  test('retains_edits_made_during_a_save_and_updates_only_the_saved_baseline', async () => {
    setActivePinia(createPinia())
    let resolveSave: ((value: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture())
    vi.spyOn(documentApi, 'save').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const store = useDocumentStore()
    await store.load(firstId)
    store.setTitle(firstId, 'Requested title')
    const pending = store.save(firstId)
    store.setTitle(firstId, 'Later edit')
    resolveSave?.(documentFixture({ title: 'Requested title', revision: 1 }))
    expect(await pending).toBe(true)
    expect(store.sessionFor(firstId)?.title).toBe('Later edit')
    expect(store.sessionFor(firstId)?.isDirty).toBe(true)
    expect(store.sessionFor(firstId)?.revision).toBe(1)
  })

  test('uses_only_the_approved_document_nodes_and_marks', () => {
    const editor = new Editor({ extensions: documentExtensions(), content: emptyContent })
    const nodeNames = Object.keys(editor.schema.nodes)
    const markNames = Object.keys(editor.schema.marks)

    expect(nodeNames).toEqual(
      expect.arrayContaining([
        'doc',
        'paragraph',
        'heading',
        'text',
        'blockquote',
        'bulletList',
        'orderedList',
        'listItem',
        'horizontalRule',
        'hardBreak',
      ]),
    )
    expect(markNames).toEqual(expect.arrayContaining(['bold', 'italic', 'underline', 'strike']))
    expect(nodeNames).not.toEqual(expect.arrayContaining(['codeBlock']))
    expect(markNames).not.toEqual(expect.arrayContaining(['code']))
    editor.destroy()
  })

  test('derives_normalized_text_word_and_character_counts_locally', () => {
    const text = editorText(proseContent)
    expect(text).toBe('A Beginning\n\nQuiet words.')
    expect(countText(text)).toEqual({ words: 4, characters: 25 })
  })

  test('keeps_the_saved_word_count_while_the_unsaved_content_changes', async () => {
    setActivePinia(createPinia())
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get').mockResolvedValue(documentFixture({ contentJson: proseContent, contentText: 'Stale server text' }))
    vi.spyOn(documentApi, 'save').mockResolvedValue(documentFixture({ contentJson: emptyContent, revision: 1 }))
    const store = useDocumentStore()

    await store.load(firstId)
    expect(store.sessionFor(firstId)!.savedWordCount).toBe(4)
    store.setContent(firstId, emptyContent)
    expect(store.sessionFor(firstId)!.counts.words).toBe(0)
    expect(store.sessionFor(firstId)!.savedWordCount).toBe(4)
    await store.save(firstId)
    expect(store.sessionFor(firstId)!.savedWordCount).toBe(0)
  })

  test('tracks_title_content_and_notes_and_saves_them_in_one_request', async () => {
    setActivePinia(createPinia())
    let resolveSave: ((response: Response) => void) | undefined
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(documentFixture())
      return saveResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = useDocumentStore()
    await store.load(firstId)

    store.setTitle(firstId, 'Opening')
    store.setContent(firstId, proseContent)
    store.setNotes(firstId, 'Keep this restrained.')
    expect(store.sessionFor(firstId)!.isDirty).toBe(true)
    expect(store.sessionFor(firstId)!.saveState).toBe('unsaved')

    const saving = store.save(firstId)
    expect(store.sessionFor(firstId)!.saveState).toBe('saving')
    resolveSave?.(
      jsonResponse(
        documentFixture({
          title: 'Opening',
          contentJson: proseContent,
          contentText: editorText(proseContent),
          notesText: 'Keep this restrained.',
          revision: 1,
        }),
      ),
    )
    await saving

    const puts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(JSON.parse(String(puts[0]?.[1]?.body))).toEqual({
      title: 'Opening',
      contentJson: proseContent,
      notesText: 'Keep this restrained.',
      expectedRevision: 0,
    })
    expect(store.sessionFor(firstId)!.isDirty).toBe(false)
    expect(store.sessionFor(firstId)!.saveState).toBe('saved')
  })

  test('keeps_the_local_buffer_on_conflict_then_keep_mine_adopts_the_latest_revision', async () => {
    setActivePinia(createPinia())
    let putCount = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(documentFixture())
      putCount += 1
      if (putCount === 1) {
        return jsonResponse(
          {
            code: 'DOCUMENT_CONFLICT',
            message: 'The document changed in another tab.',
            details: { currentRevision: 4, savedAt: '2026-10-10T00:05:00.000Z' },
          },
          409,
        )
      }
      const body = JSON.parse(String(init?.body)) as { expectedRevision: number }
      return jsonResponse(
        documentFixture({
          title: 'My local title',
          contentJson: proseContent,
          contentText: editorText(proseContent),
          notesText: 'My local notes',
          revision: body.expectedRevision + 1,
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = useDocumentStore()
    await store.load(firstId)
    store.setTitle(firstId, 'My local title')
    store.setContent(firstId, proseContent)
    store.setNotes(firstId, 'My local notes')

    await store.save(firstId)
    expect(store.sessionFor(firstId)!.saveState).toBe('conflict')
    expect(store.sessionFor(firstId)!.title).toBe('My local title')
    expect(store.sessionFor(firstId)!.contentJson).toEqual(proseContent)
    expect(store.sessionFor(firstId)!.notesText).toBe('My local notes')

    await store.keepMine(firstId)
    const putBodies = fetchMock.mock.calls
      .filter((call) => call[1]?.method === 'PUT')
      .map((call) => JSON.parse(String(call[1]?.body)) as { expectedRevision: number })
    expect(putBodies.map((body) => body.expectedRevision)).toEqual([0, 4])
    expect(store.sessionFor(firstId)!.saveState).toBe('saved')
  })

  test('loading_another_document_retains_a_failed_dirty_session_without_prompting', async () => {
    setActivePinia(createPinia())
    let failSave = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return jsonResponse(documentFixture({ id: String(input).includes(secondId) ? secondId : firstId }))
      }
      if (failSave) return jsonResponse({ code: 'SAVE_FAILED', message: 'Disk unavailable.' }, 500)
      return jsonResponse(documentFixture({ title: 'Changed', revision: 1 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = useDocumentStore()
    await store.load(firstId)
    store.setTitle(firstId, 'Changed')
    await store.save(firstId)
    expect(store.sessionFor(firstId)!.saveState).toBe('failed')
    expect(store.sessionFor(firstId)!.errorMessage).toBe('Disk unavailable.')

    const confirm = vi.spyOn(window, 'confirm')
    expect(await store.load(secondId)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(store.sessionFor(firstId)!.documentId).toBe(firstId)
    expect(store.sessionFor(firstId)!.isDirty).toBe(true)
    expect(store.sessionFor(secondId)!.isDirty).toBe(false)
    failSave = false
    await store.save(firstId)
    expect(store.sessionFor(firstId)!.saveState).toBe('saved')
  })

  test('applies_a_late_save_response_only_to_its_matching_session', async () => {
    setActivePinia(createPinia())
    let resolveSave: ((document: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get')
      .mockResolvedValueOnce(documentFixture({ id: firstId }))
      .mockResolvedValueOnce(documentFixture({ id: secondId, title: 'Second', revision: 7 }))
    vi.spyOn(documentApi, 'save').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const store = useDocumentStore()

    await store.load(firstId)
    store.setTitle(firstId, 'Delayed title')
    const saving = store.save(firstId)
    await store.load(secondId)
    resolveSave?.(documentFixture({ id: firstId, title: 'Delayed title', revision: 1 }))
    await saving

    expect(store.sessionFor(firstId)!.title).toBe('Delayed title')
    expect(store.sessionFor(firstId)!.revision).toBe(1)
    expect(store.sessionFor(firstId)!.saveState).toBe('saved')
    expect(store.sessionFor(secondId)!.title).toBe('Second')
    expect(store.sessionFor(secondId)!.revision).toBe(7)
  })

  test('ignores_a_late_snapshot_list_from_the_previous_document', async () => {
    setActivePinia(createPinia())
    let resolveFirst: ((snapshots: Awaited<ReturnType<typeof snapshotApi.list>>) => void) | undefined
    vi.spyOn(documentApi, 'get').mockImplementation(async (id) =>
      documentFixture({ id, title: id === firstId ? 'First' : 'Second' }),
    )
    vi.spyOn(snapshotApi, 'list').mockImplementation((id) => {
      if (id === firstId) return new Promise((resolve) => { resolveFirst = resolve })
      return Promise.resolve([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', documentId: secondId, name: 'Second snapshot', contentJson: emptyContent, contentText: '', createdAt: '2026-10-10T00:00:00.000Z' }])
    })
    const store = useDocumentStore()

    await store.load(firstId)
    await store.load(secondId)
    await vi.waitFor(() => expect(store.sessionFor(secondId)!.snapshots.map((snapshot) => snapshot.name)).toEqual(['Second snapshot']))
    resolveFirst?.([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentId: firstId, name: 'First snapshot', contentJson: emptyContent, contentText: '', createdAt: '2026-10-10T00:00:00.000Z' }])
    await flushPromises()

    expect(store.sessionFor(firstId)!.snapshots.map((snapshot) => snapshot.name)).toEqual(['First snapshot'])
    expect(store.sessionFor(secondId)!.snapshots.map((snapshot) => snapshot.name)).toEqual(['Second snapshot'])
  })

  test('renders_the_formatting_controls_and_emits_the_explicit_save_shortcut', async () => {
    const wrapper = mount(DocumentEditor, {
      attachTo: document.body,
      props: { modelValue: proseContent },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    await flushPromises()

    expect(wrapper.get('[role="toolbar"][aria-label="Text formatting"]')).toBeTruthy()
    expect(wrapper.get('button[aria-label="Indent"] .pi-indent')).toBeTruthy()
    expect(wrapper.get('button[aria-label="Outdent"] .pi-outdent')).toBeTruthy()
    expect(wrapper.get('button[aria-label="Block quote"] .pi-block-quote')).toBeTruthy()
    expect(wrapper.get('[contenteditable="true"][aria-label="Document editor"]')).toBeTruthy()
    await wrapper.get('[data-document-editor]').trigger('keydown', { key: 's', ctrlKey: true })
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  test('reserves_the_modified_shift_s_shortcut_for_strikethrough', async () => {
    const wrapper = mount(DocumentEditor, {
      attachTo: document.body,
      props: { modelValue: proseContent },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    await flushPromises()

    await wrapper.get('[contenteditable="true"][aria-label="Document editor"]').trigger('keydown', {
      key: 's',
      ctrlKey: true,
      shiftKey: true,
    })

    expect(wrapper.emitted('save')).toBeUndefined()
  })

  test('emits_signed_word_deltas_for_typing_and_deletion_but_not_formatting', async () => {
    const wrapper = mount(DocumentEditor, {
      attachTo: document.body,
      props: { modelValue: emptyContent },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    try {
      await flushPromises()
      const editable = wrapper.get('[contenteditable="true"][aria-label="Document editor"]')
      for (const text of ['Quiet', 'Quiet words', 'Quiet']) {
        editable.get('p').element.textContent = text
        await editable.trigger('input')
        await flushPromises()
      }
      expect(wrapper.emitted('word-count-delta')).toEqual([[1], [1], [-1]])
      await wrapper.get('button[aria-label="Heading 1"]').trigger('click')
      await flushPromises()
      expect(editable.get('h1').text()).toBe('Quiet')
      expect(wrapper.emitted('word-count-delta')).toEqual([[1], [1], [-1]])
      expect(wrapper.emitted('update:modelValue')).toHaveLength(4)
    } finally {
      wrapper.unmount()
    }
  })

  test('does_not_emit_activity_or_model_updates_for_server_content_replacement', async () => {
    const wrapper = mount(DocumentEditor, {
      props: { modelValue: emptyContent },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    try {
      await flushPromises()
      await wrapper.setProps({ modelValue: proseContent })
      expect(wrapper.get('[aria-label="Document editor"]').text()).toContain('Quiet words.')
      expect(wrapper.emitted('word-count-delta')).toBeUndefined()
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  test.each([
    ['saved', 'Saved'],
    ['unsaved', 'Unsaved'],
    ['saving', 'Saving…'],
    ['failed', 'Save failed'],
    ['conflict', 'Conflict'],
  ] as const)('renders_the_%s_save_status_label', (state, label) => {
    const wrapper = mount(SaveStatus, { props: { state } })
    expect(wrapper.text()).toContain(label)
  })
})
