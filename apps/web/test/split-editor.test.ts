import type { DocumentDto, EditorDocument } from '@pluma/shared'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ApiRequestError } from '../src/api/client.js'
import { documentApi } from '../src/api/documents.js'
import { snapshotApi } from '../src/api/snapshots.js'
import DocumentEditor from '../src/features/editor/DocumentEditor.vue'
import DocumentPane from '../src/features/editor/DocumentPane.vue'
import SplitEditor from '../src/features/editor/SplitEditor.vue'
import { useDocumentStore } from '../src/stores/document.js'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const thirdId = '33333333-3333-4333-8333-333333333333'
const emptyContent: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
const wrappers: VueWrapper[] = []

function fixture(id: string, overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id,
    projectId: '44444444-4444-4444-8444-444444444444',
    title: id === firstId ? 'Chapter One' : id === secondId ? 'Research' : 'Chapter Three',
    contentJson: emptyContent,
    contentText: '',
    notesText: '',
    revision: 0,
    savedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  }
}

function mountSplit(props: Partial<InstanceType<typeof SplitEditor>['$props']> = {}) {
  const wrapper = mount(SplitEditor, {
    attachTo: document.body,
    props: { documentIds: [firstId, secondId], focusedId: firstId, orientation: 'vertical', ratio: 0.5, ...props },
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
  })
  wrappers.push(wrapper)
  return wrapper
}

async function typeIn(wrapper: VueWrapper, label: string, text: string): Promise<void> {
  const editable = wrapper.get(`[aria-label="${label} document editor"]`)
  editable.get('p').element.textContent = text
  await editable.trigger('input')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(snapshotApi, 'list').mockResolvedValue([])
  vi.spyOn(documentApi, 'get').mockImplementation(async (id) => fixture(id))
  vi.spyOn(documentApi, 'save').mockImplementation(async (id, payload) => fixture(id, { ...payload, revision: 1 }))
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('split document panes', () => {
  test('replaces_the_unfocused_participant_with_a_snapshot_and_emits_close', async () => {
    // Catches snapshot panes being appended as a third participant or closing without exiting split.
    const wrapper = mountSplit({
      orientation: 'horizontal',
      focusedId: secondId,
      snapshot: {
        mode: 'preview',
        summary: {
          id: '55555555-5555-4555-8555-555555555555',
          documentId: secondId,
          name: 'First pass',
          wordCount: 2,
          createdAt: '2026-10-10T00:01:00.000Z',
        },
        detail: {
          id: '55555555-5555-4555-8555-555555555555',
          documentId: secondId,
          name: 'First pass',
          contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Earlier prose' }] }] },
          contentText: 'Earlier prose',
          createdAt: '2026-10-10T00:01:00.000Z',
        },
        currentText: 'Current prose',
        loading: false,
        error: '',
      },
    } as never)
    await flushPromises()

    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
    expect(wrapper.get(`[data-document-pane="${secondId}"]`).exists()).toBe(true)
    expect(wrapper.get('[data-snapshot-pane]').attributes('aria-label')).toBe('First pass snapshot preview')
    expect(wrapper.get('[role="separator"]').attributes('aria-orientation')).toBe('horizontal')
    await wrapper.get('[aria-label="Close snapshot pane"]').trigger('click')
    expect(wrapper.emitted('closeSnapshot')).toEqual([[]])
  })

  test('renders_and_edits_two_keyed_document_sessions', async () => {
    const wrapper = mountSplit()
    await flushPromises()
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(2)
    await typeIn(wrapper, 'Chapter One', 'First edit')
    await typeIn(wrapper, 'Research', 'Second edit')
    const documents = useDocumentStore()
    expect(documents.sessionFor(firstId)?.contentText).toBe('First edit')
    expect(documents.sessionFor(secondId)?.contentText).toBe('Second edit')
    expect(wrapper.emitted('wordCountDelta')).toEqual([[2], [2]])
  })

  test('emits_the_document_id_for_pointer_and_keyboard_focus_entry', async () => {
    const wrapper = mountSplit()
    await flushPromises()
    await wrapper.get('[aria-label="Research document editor"]').trigger('focusin')
    await wrapper.findAll('input[aria-label="Document title"]')[0]!.trigger('focusin')
    expect(wrapper.emitted('focus')).toEqual([[secondId], [firstId]])
    expect(wrapper.findAll('[data-document-pane]')[0]!.classes()).toContain('is-focused')
    await wrapper.setProps({ focusedId: secondId })
    expect(wrapper.findAll('[data-document-pane]')[1]!.classes()).toContain('is-focused')
  })

  test('keeps_a_loading_failure_and_retry_within_its_own_pane', async () => {
    let resolveFirst: ((document: DocumentDto) => void) | undefined
    vi.mocked(documentApi.get).mockImplementation((id) => id === firstId
      ? new Promise((resolve) => { resolveFirst = resolve })
      : Promise.reject(new Error('Research is unavailable.')))
    const wrapper = mountSplit()
    await flushPromises()
    const panes = wrapper.findAll('[data-document-pane]')
    expect(panes[0]!.text()).toContain('Opening document')
    expect(panes[1]!.get('[role="alert"]').text()).toContain('Research is unavailable.')
    vi.mocked(documentApi.get).mockResolvedValue(fixture(secondId))
    await panes[1]!.get('button').trigger('click')
    resolveFirst?.(fixture(firstId))
    await flushPromises()
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(2)
  })

  test('keeps_a_conflict_local_while_the_other_document_remains_saveable', async () => {
    vi.mocked(documentApi.save).mockImplementation(async (id, payload) => {
      if (id === firstId && payload.expectedRevision === 0) throw new ApiRequestError(409, {
        code: 'DOCUMENT_CONFLICT', message: 'Changed elsewhere.',
        details: { currentRevision: 3, savedAt: 'later' },
      })
      return fixture(id, { ...payload, revision: payload.expectedRevision + 1 })
    })
    const wrapper = mountSplit()
    await flushPromises()
    await typeIn(wrapper, 'Chapter One', 'Local first')
    await typeIn(wrapper, 'Research', 'Local second')
    const panes = wrapper.findAll('[data-document-pane]')
    await panes[0]!.get('[data-document-editor]').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(panes[0]!.get('[role="alert"]').text()).toContain('Conflict')
    expect(panes[1]!.find('[role="alert"]').exists()).toBe(false)
    await panes[1]!.get('[data-document-editor]').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(useDocumentStore().sessionFor(secondId)?.saveState).toBe('saved')
    expect(wrapper.emitted('saved')).toEqual([[secondId, 'Research']])
    const keep = panes[0]!.findAll('button').find((button) => button.text() === 'Keep mine')!
    await keep.trigger('click')
    await flushPromises()
    expect(useDocumentStore().sessionFor(firstId)?.revision).toBe(4)
    expect(useDocumentStore().sessionFor(firstId)?.contentText).toBe('Local first')
    expect(wrapper.emitted('saved')).toContainEqual([firstId, 'Chapter One'])
  })

  test('routes_failed_save_retry_and_server_reload_to_the_owning_document', async () => {
    vi.mocked(documentApi.save).mockRejectedValueOnce(new Error('Disk unavailable.'))
    const wrapper = mountSplit()
    await flushPromises()
    await typeIn(wrapper, 'Research', 'New words')
    const pane = wrapper.findAll('[data-document-pane]')[1]!
    await pane.get('[data-document-editor]').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(pane.get('[role="alert"]').text()).toContain('Disk unavailable.')
    await pane.get('button[aria-label="Retry save"]').trigger('click')
    await flushPromises()
    expect(useDocumentStore().sessionFor(secondId)?.saveState).toBe('saved')
    useDocumentStore().sessionFor(secondId)!.operation = 'conflict'
    await flushPromises()
    await pane.findAll('button').find((button) => button.text() === 'Reload server copy')!.trigger('click')
    await flushPromises()
    expect(useDocumentStore().sessionFor(secondId)?.contentText).toBe('')
    expect(useDocumentStore().sessionFor(firstId)?.saveState).toBe('saved')
  })

  test('updates_the_accessible_editor_label_after_title_edits', async () => {
    const wrapper = mountSplit()
    await flushPromises()
    await wrapper.findAll('input[aria-label="Document title"]')[1]!.setValue('Reference notes')
    expect(wrapper.get('[aria-label="Reference notes document editor"]').attributes('contenteditable')).toBe('true')
    expect(useDocumentStore().sessionFor(firstId)?.title).toBe('Chapter One')
    expect(useDocumentStore().sessionFor(secondId)?.title).toBe('Reference notes')
  })

  test.each([
    ['save', 'suspension'],
    ['save', 'replacement'],
    ['keepMine', 'suspension'],
    ['keepMine', 'replacement'],
    ['reloadServerCopy', 'suspension'],
    ['reloadServerCopy', 'replacement'],
  ] as const)('reports_%s_completion_after_pane_%s', async (action, transition) => {
    const wrapper = mountSplit()
    await flushPromises()
    const documents = useDocumentStore()
    documents.setTitle(secondId, 'Retitled research')
    if (action !== 'save') {
      vi.mocked(documentApi.save).mockRejectedValueOnce(new ApiRequestError(409, {
        code: 'DOCUMENT_CONFLICT', message: 'Changed elsewhere.',
        details: { currentRevision: 3, savedAt: 'later' },
      }))
      await documents.save(secondId)
      await flushPromises()
    }
    let resolveOperation: ((document: DocumentDto) => void) | undefined
    const pending = new Promise<DocumentDto>((resolve) => { resolveOperation = resolve })
    if (action === 'reloadServerCopy') vi.mocked(documentApi.get).mockReturnValueOnce(pending)
    else vi.mocked(documentApi.save).mockReturnValueOnce(pending)
    const pane = wrapper.get(`[data-document-pane="${secondId}"]`)
    if (action === 'save') {
      await pane.get('[data-document-editor]').trigger('keydown', { key: 's', ctrlKey: true })
    } else {
      const label = action === 'keepMine' ? 'Keep mine' : 'Reload server copy'
      await pane.findAll('button').find((button) => button.text() === label)!.trigger('click')
    }
    expect(wrapper.emitted('saved')).toBeUndefined()
    if (transition === 'suspension') await wrapper.setProps({ singlePane: true })
    else await wrapper.setProps({ documentIds: [firstId, thirdId], focusedId: thirdId })
    expect(wrapper.find(`[data-document-pane="${secondId}"]`).exists()).toBe(false)
    resolveOperation?.(fixture(secondId, { title: 'Saved research', revision: 4 }))
    await flushPromises()
    expect(documents.sessionFor(secondId)?.title).toBe('Saved research')
    expect(wrapper.emitted('saved')).toEqual([[secondId, 'Saved research']])
    expect(documents.sessionFor(firstId)?.title).toBe('Chapter One')
  })

  test.each(['vertical', 'horizontal'] as const)('keeps_stable_%s_grid_order_and_forwards_keyboard_resize', async (orientation) => {
    const wrapper = mountSplit({ orientation, ratio: 0.4 })
    await flushPromises()
    const children = Array.from(wrapper.element.children)
    expect(children.map((child) => child.getAttribute('data-document-pane') ?? child.getAttribute('role'))).toEqual([firstId, 'separator', secondId])
    expect(wrapper.attributes('style')).toContain(orientation === 'vertical' ? 'grid-template-columns: 0.4fr 1px 0.6fr' : 'grid-template-rows: 0.4fr 1px 0.6fr')
    await wrapper.get('[role="separator"]').trigger('keydown', { key: orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown' })
    expect(wrapper.emitted('resize')?.[0]?.[0]).toBeCloseTo(0.45)
  })

  test('suspends_the_other_pane_without_discarding_its_session_and_restores_scroll', async () => {
    const wrapper = mountSplit()
    await flushPromises()
    const documents = useDocumentStore()
    await typeIn(wrapper, 'Research', 'Retained second')
    const scroll = wrapper.findAll('.document-scroll')[1]!
    scroll.element.scrollTop = 215
    await scroll.trigger('scroll')
    expect(documents.sessionFor(secondId)?.scrollTop).toBe(215)
    const firstEditor = wrapper.get('[aria-label="Chapter One document editor"]').element
    await wrapper.setProps({ singlePane: true })
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(1)
    expect(wrapper.find('[role="separator"]').exists()).toBe(false)
    expect(wrapper.get('[aria-label="Chapter One document editor"]').element).toBe(firstEditor)
    expect(documents.sessionFor(secondId)?.contentText).toBe('Retained second')
    await wrapper.setProps({ singlePane: false })
    await flushPromises()
    expect(wrapper.findAll('.document-scroll')[1]!.element.scrollTop).toBe(215)
    expect(wrapper.get('[aria-label="Research document editor"]').text()).toBe('Retained second')
    await wrapper.setProps({ singlePane: true, focusedId: secondId })
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(1)
    expect(wrapper.get('[aria-label="Research document editor"]').exists()).toBe(true)
  })

  test('keys_editor_identity_by_document_through_replacement_and_reordering', async () => {
    const wrapper = mountSplit()
    await flushPromises()
    await typeIn(wrapper, 'Chapter One', 'Retained first')
    const scroll = wrapper.findAll('.document-scroll')[0]!
    scroll.element.scrollTop = 180
    await scroll.trigger('scroll')
    const secondEditor = wrapper.get('[aria-label="Research document editor"]').element
    await wrapper.setProps({ documentIds: [thirdId, secondId], focusedId: thirdId })
    await flushPromises()
    expect(wrapper.get('[aria-label="Research document editor"]').element).toBe(secondEditor)
    await wrapper.setProps({ documentIds: [secondId, firstId], focusedId: firstId })
    await flushPromises()
    expect(wrapper.get('[aria-label="Research document editor"]').element).toBe(secondEditor)
    expect(wrapper.get('[aria-label="Chapter One document editor"]').text()).toBe('Retained first')
    expect(wrapper.findAll('.document-scroll')[1]!.element.scrollTop).toBe(180)
  })

  test('bounds_malformed_participants_and_renders_one_pane_without_a_split', async () => {
    const wrapper = mountSplit({ documentIds: [firstId, firstId, secondId, thirdId] })
    await flushPromises()
    expect(wrapper.findAllComponents(DocumentPane)).toHaveLength(2)
    await wrapper.setProps({ orientation: null, focusedId: secondId })
    expect(wrapper.findAllComponents(DocumentPane)).toHaveLength(1)
    expect(wrapper.get('[aria-label="Research document editor"]').exists()).toBe(true)
  })

  test('restores_scroll_and_label_when_mounting_a_standalone_editor', async () => {
    // Model the browser clamping scroll on an empty container before Tiptap mounts.
    const setScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!.set!
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
      const contentReady = !this.matches('.document-scroll') || this.querySelector('[contenteditable]') !== null
      setScrollTop.call(this, contentReady ? value : 0)
    })
    const wrapper = mount(DocumentEditor, {
      props: { modelValue: emptyContent, scrollTop: 90, ariaLabel: 'Standalone draft' },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    })
    wrappers.push(wrapper)
    await flushPromises()
    expect(wrapper.get('.document-scroll').element.scrollTop).toBe(90)
    expect(wrapper.get('[aria-label="Standalone draft"]').attributes('contenteditable')).toBe('true')
  })
})
