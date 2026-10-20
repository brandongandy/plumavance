import type { DocumentDto, EditorDocument } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import DocumentEditor from '../src/features/editor/DocumentEditor.vue'
import SaveStatus from '../src/features/editor/SaveStatus.vue'
import { documentApi } from '../src/api/documents.js'
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
    expect(store.savedWordCount).toBe(4)
    store.setContent(emptyContent)
    expect(store.counts.words).toBe(0)
    expect(store.savedWordCount).toBe(4)
    await store.save()
    expect(store.savedWordCount).toBe(0)
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

    store.setTitle('Opening')
    store.setContent(proseContent)
    store.setNotes('Keep this restrained.')
    expect(store.isDirty).toBe(true)
    expect(store.saveState).toBe('unsaved')

    const saving = store.save()
    expect(store.saveState).toBe('saving')
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
    expect(store.isDirty).toBe(false)
    expect(store.saveState).toBe('saved')
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
    store.setTitle('My local title')
    store.setContent(proseContent)
    store.setNotes('My local notes')

    await store.save()
    expect(store.saveState).toBe('conflict')
    expect(store.title).toBe('My local title')
    expect(store.contentJson).toEqual(proseContent)
    expect(store.notesText).toBe('My local notes')

    await store.keepMine()
    const putBodies = fetchMock.mock.calls
      .filter((call) => call[1]?.method === 'PUT')
      .map((call) => JSON.parse(String(call[1]?.body)) as { expectedRevision: number })
    expect(putBodies.map((body) => body.expectedRevision)).toEqual([0, 4])
    expect(store.saveState).toBe('saved')
  })

  test('shows_failed_then_retries_and_can_cancel_loading_another_document', async () => {
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
    store.setTitle('Changed')
    await store.save()
    expect(store.saveState).toBe('failed')
    expect(store.errorMessage).toBe('Disk unavailable.')

    expect(await store.load(secondId, () => false)).toBe(false)
    expect(store.documentId).toBe(firstId)
    failSave = false
    await store.save()
    expect(store.saveState).toBe('saved')
  })

  test('ignores_a_save_response_after_another_document_has_loaded', async () => {
    setActivePinia(createPinia())
    let resolveSave: ((document: DocumentDto) => void) | undefined
    vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
    vi.spyOn(documentApi, 'get')
      .mockResolvedValueOnce(documentFixture({ id: firstId }))
      .mockResolvedValueOnce(documentFixture({ id: secondId, title: 'Second', revision: 7 }))
    vi.spyOn(documentApi, 'save').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const store = useDocumentStore()

    await store.load(firstId)
    store.setTitle('Delayed title')
    const saving = store.save()
    await store.load(secondId, () => true)
    resolveSave?.(documentFixture({ id: firstId, title: 'Delayed title', revision: 1 }))
    await saving

    expect(store.documentId).toBe(secondId)
    expect(store.title).toBe('Second')
    expect(store.revision).toBe(7)
    expect(store.saveState).toBe('saved')
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
    await vi.waitFor(() => expect(store.snapshots.map((snapshot) => snapshot.name)).toEqual(['Second snapshot']))
    resolveFirst?.([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', documentId: firstId, name: 'First snapshot', contentJson: emptyContent, contentText: '', createdAt: '2026-10-10T00:00:00.000Z' }])
    await flushPromises()

    expect(store.documentId).toBe(secondId)
    expect(store.snapshots.map((snapshot) => snapshot.name)).toEqual(['Second snapshot'])
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
