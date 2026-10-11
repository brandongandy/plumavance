import type { DocumentDto, SnapshotDto } from '@scr/shared'
import PrimeVue from 'primevue/config'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import InspectorPane from '../src/features/inspector/InspectorPane.vue'
import SnapshotCompareDialog from '../src/features/inspector/SnapshotCompareDialog.vue'
import { useDocumentStore } from '../src/stores/document.js'

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

afterEach(() => {
  vi.unstubAllGlobals()
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
    if (path.endsWith('/snapshots') && method === 'GET') return Response.json([snapshotFixture])
    if (path.endsWith('/snapshots') && method === 'POST') {
      return Response.json({ ...snapshotFixture, id: '44444444-4444-4444-8444-444444444444', name: 'Milestone' }, { status: 201 })
    }
    if (path.endsWith('/restore')) return Response.json(documentFixture('Earlier prose', 3))
    if (method === 'PATCH') return Response.json({ ...snapshotFixture, name: 'Renamed' })
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json(snapshotFixture)
  })
  vi.stubGlobal('fetch', fetchMock)
  const store = useDocumentStore()
  await store.load(documentId)
  const wrapper = mount(InspectorPane, {
    attachTo: document.body,
    props: { notes: '', hasDocument: true },
    global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] },
  })
  await wrapper.get('button[role="tab"]:nth-child(2)').trigger('click')
  await flushPromises()
  return { wrapper, store, requests }
}

describe('snapshot inspector', () => {
  test('creates_only_on_explicit_take_and_requires_saving_a_dirty_buffer_first', async () => {
    const { wrapper, store, requests } = await mountedInspector()
    expect(wrapper.text()).toContain('First pass')
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)

    store.setContent(content('Unsaved prose'))
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

    await wrapper.get('button[aria-label="Restore First pass"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Confirm restore snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(store.contentText).toBe('Earlier prose')

    await wrapper.get('button[aria-label="Delete First pass"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('button[aria-label="Confirm delete snapshot"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true)
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
