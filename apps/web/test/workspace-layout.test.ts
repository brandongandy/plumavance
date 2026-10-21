import axeCore from 'axe-core'
import PrimeVue from 'primevue/config'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, watch } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { binderApi } from '../src/api/binder.js'
import { ApiRequestError } from '../src/api/client.js'
import { documentApi } from '../src/api/documents.js'
import { snapshotApi } from '../src/api/snapshots.js'
import WorkspaceView from '../src/views/WorkspaceView.vue'
import DocumentEditor from '../src/features/editor/DocumentEditor.vue'
import { useDocumentStore } from '../src/stores/document.js'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const nextProjectId = '44444444-4444-4444-8444-444444444444'
const nextDocumentId = '66666666-6666-4666-8666-666666666666'
const researchDocumentId = '77777777-7777-4777-8777-777777777777'
const chapterId = '33333333-3333-4333-8333-333333333333'
const folderId = '22222222-2222-4222-8222-222222222222'
const snapshotId = '88888888-8888-4888-8888-888888888888'

const snapshotSummary = {
  id: snapshotId,
  documentId: chapterId,
  name: 'First pass',
  wordCount: 2,
  createdAt: '2026-10-10T00:01:00.000Z',
}

const snapshotDetail = {
  ...snapshotSummary,
  contentText: 'Earlier prose',
  contentJson: { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Earlier prose' }] }] },
}

function projectResponse(id = projectId): Response {
  return Response.json({
    project: {
      id,
      name: id === projectId ? 'The Long Draft' : 'The Next Draft',
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      lastOpenedAt: '2026-10-10T00:00:00.000Z',
      projectWordTarget: null,
      dailyWordTarget: null,
      dailyCountMode: 'additions',
    },
    items: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        projectId: id,
        parentId: null,
        kind: 'folder',
        title: 'Manuscript',
        position: 0,
        trashedAt: null,
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
      {
        id: id === projectId ? '33333333-3333-4333-8333-333333333333' : nextDocumentId,
        projectId: id,
        parentId: '22222222-2222-4222-8222-222222222222',
        kind: 'document',
        title: id === projectId ? 'Chapter One' : 'Chapter Two',
        position: 0,
        trashedAt: null,
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
    ],
    trashedItems: [],
  })
}

const wrappers: VueWrapper[] = []

async function mountWorkspace(width = 1280, handler?: (url: URL, init?: RequestInit) => Response | Promise<Response>): Promise<VueWrapper> {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (handler) return handler(url, init)
    return workspaceResponse(url)
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Projects</main>' } },
      { path: '/projects/:projectId', component: WorkspaceView },
    ],
  })
  await router.push(`/projects/${projectId}`)
  await router.isReady()
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [router, createPinia(), [PrimeVue, { unstyled: true }]] },
  })
  await flushPromises()
  wrappers.push(wrapper)
  return wrapper
}

function researchDocumentResponse(): Response {
  return Response.json({
    id: researchDocumentId,
    projectId,
    title: 'Research Notes',
    notesText: '',
    revision: 0,
    savedAt: '2026-10-10T00:00:00.000Z',
    contentText: 'Research prose',
    contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Research prose' }] }] },
  })
}

async function mountWorkspaceWithTwoDocuments(
  loadResearch: () => Response | Promise<Response> = researchDocumentResponse,
  handleRequest?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined,
): Promise<VueWrapper> {
  const detail = await projectResponse().json()
  detail.items.push({
    ...detail.items[1],
    id: researchDocumentId,
    title: 'Research Notes',
    position: 1,
  })
  return mountWorkspace(1280, (url, init) => {
    const response = handleRequest?.(url, init)
    if (response) return response
    if (url.pathname === `/api/projects/${projectId}`) return Response.json(detail)
    if (url.pathname === `/api/documents/${researchDocumentId}`) return loadResearch()
    return workspaceResponse(url)
  })
}

function workspaceResponse(url: URL): Response {
  if (url.pathname.endsWith('/writing-progress')) return Response.json({
    projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions',
    projectWordCount: 100, dailyWordCount: 10, localDate: url.searchParams.get('localDate'),
  })
  if (url.pathname.endsWith('/snapshots')) return Response.json([])
  if (url.pathname.startsWith('/api/documents/')) return Response.json({
    id: url.pathname.split('/')[3], projectId: url.pathname.includes(nextDocumentId) ? nextProjectId : projectId,
    title: url.pathname.includes(nextDocumentId) ? 'Chapter Two' : 'Chapter One', notesText: '', revision: 0,
    savedAt: '2026-10-10T00:00:00.000Z', contentText: 'Saved prose',
    contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved prose' }] }] },
  })
  return projectResponse(url.pathname.split('/')[3])
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.editorFont
  document.documentElement.classList.remove('pluma-dark')
  document.documentElement.style.removeProperty('color-scheme')
})

describe('workspace layout', () => {
  async function splitWorkspace(): Promise<VueWrapper> {
    const wrapper = await mountWorkspaceWithTwoDocuments()
    await wrapper.get('[aria-label="Open Research Notes in new tab"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Split editor vertically"]').trigger('click')
    await flushPromises()
    return wrapper
  }

  test.each([
    ['Preview', 'preview'],
    ['Compare', 'comparison'],
  ] as const)('opens_snapshot_%s_in_a_readonly_split_pane_and_closes_by_exiting_split', async (action, mode) => {
    // Catches snapshot inspection falling back to a modal or an editable pane.
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Response.json(snapshotDetail)
      return workspaceResponse(url)
    })
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get(`[aria-label="${action} First pass"]`).trigger('click')
    await flushPromises()

    const pane = wrapper.get(`[aria-label="First pass snapshot ${mode}"]`)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
    expect(wrapper.find('.split-editor [role="separator"]').exists()).toBe(true)
    if (mode === 'preview') {
      expect(pane.get('[aria-label="First pass snapshot editor"]').attributes('contenteditable')).toBe('false')
      const readingArea = pane.get('[aria-label="First pass snapshot editor reading area"]')
      expect(readingArea.attributes('role')).toBe('document')
      expect(readingArea.attributes('tabindex')).toBe('0')
      expect(pane.find('[role="toolbar"]').exists()).toBe(false)
      expect(pane.text()).toContain('Earlier prose')
    } else {
      expect(pane.get('del').text()).toContain('Earlier')
      expect(pane.get('ins').text()).toContain('Saved')
      const editor = wrapper.get('[aria-label="Chapter One document editor"]')
      editor.get('p').element.textContent = 'Revised after comparison opened'
      await editor.trigger('input')
      await flushPromises()
      expect(pane.get('ins').text()).toContain('Saved')
      expect(pane.text()).not.toContain('Revised after comparison opened')
    }

    await pane.get('[aria-label="Close snapshot pane"]').trigger('click')
    expect(wrapper.find('[data-snapshot-pane]').exists()).toBe(false)
    expect(wrapper.find('.split-editor [role="separator"]').exists()).toBe(false)
    expect(wrapper.get('[aria-label="Chapter One document editor"]').attributes('contenteditable')).toBe('true')
  })

  test('saves_the_adjacent_document_when_the_shortcut_starts_in_a_readonly_snapshot', async () => {
    // Catches the readonly editor swallowing Cmd/Ctrl+S before the workspace can save the active draft.
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Response.json(snapshotDetail)
      return workspaceResponse(url)
    })
    await wrapper.get('[aria-label="Document title"]').setValue('Shortcut draft')
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()

    const readingArea = wrapper.get('[aria-label="First pass snapshot editor reading area"]')
    ;(readingArea.element as HTMLElement).focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    readingArea.element.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(useDocumentStore().hasDirtySessions()).toBe(false)
  })

  test('replaces_the_unfocused_document_with_a_snapshot_then_exits_the_existing_split_on_close', async () => {
    // Catches closing a snapshot revealing a previously displaced split participant.
    const wrapper = await mountWorkspaceWithTwoDocuments(researchDocumentResponse, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Response.json(snapshotDetail)
      return undefined
    })
    await wrapper.get('[aria-label="Open Research Notes in new tab"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Split editor horizontally"]').trigger('click')
    await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-title`).trigger('click')
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
    expect(wrapper.get(`[data-document-pane="${chapterId}"]`).exists()).toBe(true)
    expect(wrapper.get('.split-editor [role="separator"]').attributes('aria-orientation')).toBe('horizontal')
    await wrapper.get('[aria-label="Close snapshot pane"]').trigger('click')

    expect(useWorkspaceStore().isSplit).toBe(false)
    expect(wrapper.find('[data-snapshot-pane]').exists()).toBe(false)
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
    expect(wrapper.get(`[data-document-pane="${chapterId}"]`).exists()).toBe(true)
    expect(wrapper.get(`[data-tab-id="${researchDocumentId}"]`).exists()).toBe(true)
  })

  test('does_not_reopen_a_snapshot_pane_when_its_detail_arrives_after_close', async () => {
    // Catches a late detail response recreating a snapshot pane the writer already dismissed.
    let finishDetail!: (response: Response) => void
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) {
        return new Promise<Response>((resolve) => { finishDetail = resolve })
      }
      return workspaceResponse(url)
    })
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    expect(wrapper.get('[data-snapshot-pane]').text()).toContain('Loading snapshot')
    await wrapper.get('[aria-label="Close snapshot pane"]').trigger('click')
    finishDetail(Response.json(snapshotDetail))
    await flushPromises()

    expect(wrapper.find('[data-snapshot-pane]').exists()).toBe(false)
    expect(wrapper.find('.split-editor [role="separator"]').exists()).toBe(false)
  })

  test('a_snapshot_failure_after_close_does_not_replace_the_document_save_error', async () => {
    // Catches an inspector request leaking its error into the document save-status channel.
    let failDetail!: (reason?: unknown) => void
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) {
        return new Promise<Response>((_resolve, reject) => { failDetail = reject })
      }
      return workspaceResponse(url)
    })
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    const session = useDocumentStore().sessionFor(chapterId)!
    session.operation = 'failed'
    session.errorMessage = 'The document could not be saved.'
    await wrapper.get('[aria-label="Close snapshot pane"]').trigger('click')
    failDetail(new Error('The snapshot could not be loaded.'))
    await flushPromises()

    expect(session.errorMessage).toBe('The document could not be saved.')
    expect(wrapper.get(`[data-document-pane="${chapterId}"] [role="alert"]`).text()).toContain('The document could not be saved.')
  })

  test('shows_snapshot_load_failures_inside_the_split_pane', async () => {
    // Catches snapshot API failures leaving the new pane stuck in its loading state.
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Promise.reject(new Error('Snapshot storage is unavailable.'))
      return workspaceResponse(url)
    })
    await wrapper.get('#snapshots-tab').trigger('click')
    await wrapper.get('[aria-label="Preview First pass"]').trigger('click')
    await flushPromises()

    const pane = wrapper.get('[data-snapshot-pane]')
    expect(pane.get('[role="alert"]').text()).toContain('Snapshot storage is unavailable.')
    expect(pane.find('[role="status"]').exists()).toBe(false)
    expect(useDocumentStore().sessionFor(chapterId)?.errorMessage).toBe('')
  })

  test.each([
    [1280, 'trigger'],
    [600, 'editor'],
  ] as const)('moves_focus_into_and_out_of_the_snapshot_pane_at_%ipx', async (width, returnTarget) => {
    // Catches focus being left in a hidden inspector or lost when the snapshot pane unmounts.
    const wrapper = await mountWorkspace(width, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Response.json(snapshotDetail)
      return workspaceResponse(url)
    })
    if (width < 768) await wrapper.get('[aria-label="Inspector panel"]').trigger('click')
    await wrapper.get('#snapshots-tab').trigger('click')
    const trigger = wrapper.get('[aria-label="Preview First pass"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()

    const close = wrapper.get('[aria-label="Close snapshot pane"]')
    expect(document.activeElement).toBe(close.element)
    await close.trigger('click')
    await flushPromises()

    const expected = returnTarget === 'trigger'
      ? trigger.element
      : wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-title`).element
    expect(document.activeElement).toBe(expected)
  })

  test('closing_a_snapshot_in_focus_mode_does_not_restore_focus_to_the_hidden_inspector', async () => {
    // Catches connected-but-hidden inspector controls stealing focus in fullscreen writing mode.
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/documents/${chapterId}/snapshots`) return Response.json([snapshotSummary])
      if (url.pathname === `/api/snapshots/${snapshotId}`) return Response.json(snapshotDetail)
      return workspaceResponse(url)
    })
    await wrapper.get('#snapshots-tab').trigger('click')
    const trigger = wrapper.get('[aria-label="Preview First pass"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Focus"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Close snapshot pane"]').trigger('click')
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.get('[aria-label="Chapter One document editor"]').element)
    expect(document.activeElement).not.toBe(trigger.element)
  })

  test('renders_two_editable_documents_and_switches_orientation_without_losing_buffers', async () => {
    // Catches missing split wiring and orientation changes recreating document buffers.
    const wrapper = await splitWorkspace()
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(2)
    expect(wrapper.get('[aria-label="Chapter One document editor"]').attributes('contenteditable')).toBe('true')
    expect(wrapper.get('[aria-label="Research Notes document editor"]').attributes('contenteditable')).toBe('true')
    for (const [label, prose] of [['Chapter One', 'New chapter prose'], ['Research Notes', 'New research prose']]) {
      const editable = wrapper.get(`[aria-label="${label} document editor"]`)
      editable.get('p').element.textContent = prose!
      await editable.trigger('input')
      await flushPromises()
    }
    expect(useDocumentStore().sessionFor(chapterId)?.contentText).toBe('New chapter prose')
    expect(useDocumentStore().sessionFor(researchDocumentId)?.contentText).toBe('New research prose')
    await wrapper.get(`[data-document-pane="${chapterId}"] [aria-label="Document title"]`).setValue('Opening draft')
    await wrapper.get('[aria-label="Split editor horizontally"]').trigger('click')
    expect(useWorkspaceStore().splitOrientation).toBe('horizontal')
    expect(wrapper.findAll('[contenteditable="true"]')).toHaveLength(2)
    expect(useDocumentStore().sessionFor(chapterId)?.title).toBe('Opening draft')
    const results = await axeCore.run(document.body, { rules: { 'color-contrast': { enabled: false }, 'color-contrast-enhanced': { enabled: false } } })
    expect(results.violations).toEqual([])
  })

  test('routes_toolbar_save_notes_status_and_compile_to_the_focused_session', async () => {
    // Catches toolbar and inspector commands accidentally targeting the last-loaded document.
    const wrapper = await splitWorkspace()
    const documents = useDocumentStore()
    const chapter = wrapper.get(`[data-document-pane="${chapterId}"]`)
    await chapter.get('[aria-label="Document title"]').trigger('focusin')
    await chapter.get('[aria-label="Document title"]').setValue('Opening draft')
    await wrapper.get('[aria-label="Document notes"]').setValue('Chapter note')
    expect(documents.sessionFor(chapterId)?.notesText).toBe('Chapter note')
    expect(documents.sessionFor(researchDocumentId)?.notesText).toBe('')
    const editable = chapter.get('[contenteditable="true"]')
    editable.get('p').element.textContent = 'One two three four'
    await editable.trigger('input')
    await flushPromises()
    expect(chapter.get('.editor-toolbar [role="status"]').text()).toContain('Unsaved')
    expect(wrapper.get('footer').text()).not.toContain('Unsaved')
    expect(wrapper.get('footer').text()).toContain('4 words')
    const progress = wrapper.get('[aria-label="Writing progress settings"]')
    await progress.trigger('mouseenter')
    expect(wrapper.get('[role="tooltip"]').text()).toContain('102 words')
    await progress.trigger('mouseleave')
    await wrapper.get('[aria-label="Compile"]').trigger('click')
    expect(document.querySelector('[aria-label="Save before compile"]')).not.toBeNull()
    await wrapper.get(`[data-document-pane="${researchDocumentId}"] [aria-label="Document title"]`).trigger('focusin')
    await nextTick()
    expect(wrapper.get('footer').text()).toContain('Research Notes')
    expect(wrapper.get('footer').text()).toContain('2 words')
    expect(document.querySelector('[aria-label="Save before compile"]')).toBeNull()
    expect(wrapper.get(`[data-document-pane="${researchDocumentId}"] [aria-label="Save document"]`).attributes()).toHaveProperty('disabled')
    await chapter.get('[aria-label="Document title"]').trigger('focusin')
    await chapter.get('[aria-label="Save document"]').trigger('click')
    await flushPromises()
    const puts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(String(puts[0]?.[0])).toBe(`/api/documents/${chapterId}`)
    expect(JSON.parse(String(puts[0]?.[1]?.body))).toMatchObject({ title: 'Opening draft', notesText: 'Chapter note' })
  })

  test('selecting_a_third_tab_displaces_only_the_focused_pane_and_retains_its_dirty_session', async () => {
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    workspace.items.push({ ...workspace.items[1]!, id: nextDocumentId, title: 'Chapter Two', position: 2 })
    await wrapper.get(`[data-document-pane="${researchDocumentId}"] [aria-label="Document title"]`).setValue('Local research')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    workspace.openDocumentInNewTab(nextDocumentId)
    await flushPromises()
    expect(workspace.splitDocumentIds).toEqual([nextDocumentId, chapterId])
    expect(wrapper.findAll('[data-document-pane]').map((pane) => pane.attributes('data-document-pane'))).toEqual([nextDocumentId, chapterId])
    expect(documents.sessionFor(researchDocumentId)?.title).toBe('Local research')
    await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-title`).trigger('click')
    expect(workspace.splitDocumentIds).toEqual([researchDocumentId, chapterId])
    expect(confirm).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="Exit split view"]').trigger('click')
    expect(workspace.openDocumentIds).toEqual([chapterId, researchDocumentId, nextDocumentId])
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
  })

  test.each([chapterId, researchDocumentId])('closing_split_tab_%s_prompts_only_for_its_buffer_and_keeps_the_survivor', async (id) => {
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    documents.setTitle(id, 'Unsaved title')
    const before = [...workspace.splitDocumentIds]
    const focused = workspace.activeTabId
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const close = wrapper.get(`[data-tab-id="${id}"] .editor-tab-close`)
    await close.trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    expect(workspace.splitDocumentIds).toEqual(before)
    expect(workspace.activeTabId).toBe(focused)
    expect(documents.sessionFor(id)?.title).toBe('Unsaved title')
    confirm.mockReturnValue(true)
    await close.trigger('click')
    await flushPromises()
    const survivor = id === chapterId ? researchDocumentId : chapterId
    expect(workspace.openDocumentIds).toEqual([survivor])
    expect(workspace.activeTabId).toBe(survivor)
    expect(workspace.isSplit).toBe(false)
    expect(documents.sessionFor(id)).toBeUndefined()
  })

  test('suspends_and_restores_split_for_folder_phone_and_focus_mode_but_keeps_two_panes_at_900px', async () => {
    const wrapper = await splitWorkspace()
    const documents = useDocumentStore()
    documents.setNotes(chapterId, 'Keep chapter notes')
    documents.setNotes(researchDocumentId, 'Keep research notes')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('click')
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(0)
    expect(useWorkspaceStore().isSplit).toBe(true)
    await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-title`).trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(2)
    for (const [width, count] of [[600, 1], [900, 2], [1280, 2]]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      window.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect(wrapper.findAll('[data-document-pane]')).toHaveLength(count)
    }
    await wrapper.get('[aria-label="Focus"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.findAll('[data-document-pane]')).toHaveLength(2)
    expect(documents.sessionFor(chapterId)?.notesText).toBe('Keep chapter notes')
    expect(documents.sessionFor(researchDocumentId)?.notesText).toBe('Keep research notes')
    expect(confirm).not.toHaveBeenCalled()
  })

  test('close_others_prompts_once_for_removed_sessions_and_preserves_a_dirty_kept_tab', async () => {
    const wrapper = await splitWorkspace()
    const documents = useDocumentStore()
    documents.setTitle(chapterId, 'Dirty chapter')
    documents.setTitle(researchDocumentId, 'Dirty research')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-close`).trigger('click', { altKey: true })
    expect(confirm).toHaveBeenCalledOnce()
    expect(useWorkspaceStore().isSplit).toBe(true)
    documents.setTitle(chapterId, 'Chapter One')
    confirm.mockClear()
    await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-close`).trigger('click', { altKey: true })
    expect(confirm).not.toHaveBeenCalled()
    expect(useWorkspaceStore().openDocumentIds).toEqual([researchDocumentId])
    expect(documents.sessionFor(researchDocumentId)?.title).toBe('Dirty research')
  })

  test('beforeunload_and_route_leave_protect_an_unfocused_dirty_session', async () => {
    const wrapper = await splitWorkspace()
    useDocumentStore().setTitle(chapterId, 'Hidden dirty chapter')
    await wrapper.get('[aria-label="Exit split view"]').trigger('click')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    const router = wrapper.getComponent(WorkspaceView).vm.$router
    await router.push('/')
    expect(router.currentRoute.value.path).toBe(`/projects/${projectId}`)
    expect(confirm).toHaveBeenCalledOnce()
  })

  test.each(['close', 'close-others', 'replace', 'navigate'] as const)('pending_save_divergence_guards_%s_even_when_current_buffer_matches_old_baseline', async (action) => {
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    const session = documents.sessionFor(chapterId)!
    let finish!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => {
      finish = () => resolve({ id, projectId, ...payload, contentText: 'Saved prose', revision: 1, savedAt: 'later' })
    }))
    documents.setTitle(chapterId, 'Pending title')
    const saving = documents.save(chapterId)
    documents.setTitle(chapterId, 'Chapter One')
    expect(session.isDirty).toBe(false)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    if (action === 'close') await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-close`).trigger('click')
    if (action === 'close-others') await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-close`).trigger('click', { altKey: true })
    if (action === 'replace') {
      workspace.items.push({ ...workspace.items.find((item) => item.id === chapterId)!, id: nextDocumentId, title: 'Third chapter' })
      await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-title`).trigger('click')
      await wrapper.get(`[data-item-id="${nextDocumentId}"]`).trigger('click')
    }
    if (action === 'navigate') {
      const unload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(true)
      const router = wrapper.getComponent(WorkspaceView).vm.$router
      await router.push('/')
      expect(router.currentRoute.value.path).toBe(`/projects/${projectId}`)
    }
    expect(confirm).toHaveBeenCalledOnce()
    expect(documents.sessionFor(chapterId)).toBe(session)
    expect(workspace.openDocumentIds).toContain(chapterId)
    finish()
    expect(await saving).toBe(true)
    expect(session.isDirty).toBe(true)
  })

  test('accepting_close_during_a_divergent_save_discards_only_the_approved_session', async () => {
    const wrapper = await mountWorkspace()
    const documents = useDocumentStore()
    let finish!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => {
      finish = () => resolve({ id, projectId, ...payload, contentText: 'Saved prose', revision: 1, savedAt: 'later' })
    }))
    documents.setTitle(chapterId, 'Pending title')
    const saving = documents.save(chapterId)
    documents.setTitle(chapterId, 'Chapter One')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-close`).trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    expect(documents.sessionFor(chapterId)).toBeUndefined()
    finish()
    expect(await saving).toBe(false)
    expect(documents.hasDirtySessions()).toBe(false)
  })

  test('trash_uses_one_prompt_for_the_whole_subtree_and_ignores_unrelated_dirty_sessions', async () => {
    // Catches subtree trash ignoring hidden descendants or prompting for documents it preserves.
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    documents.setTitle(chapterId, 'Dirty chapter')
    documents.setTitle(researchDocumentId, 'Dirty research')
    const folder = workspace.items[0]!
    vi.spyOn(binderApi, 'trash').mockResolvedValue({ ...folder, trashedAt: '2026-10-21T00:00:00.000Z' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('click')
    await wrapper.get('[aria-label="Move selected item to Trash"]').trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    expect(workspace.openDocumentIds).toEqual([chapterId, researchDocumentId])
    documents.setTitle(chapterId, 'Chapter One')
    workspace.items = workspace.items.map((item) => item.id === researchDocumentId ? { ...item, parentId: null } : item)
    await wrapper.get('[aria-label="Move selected item to Trash"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(documents.sessionFor(chapterId)).toBeUndefined()
    expect(documents.sessionFor(researchDocumentId)?.title).toBe('Dirty research')
    expect(workspace.isSplit).toBe(false)
    expect(workspace.openDocumentIds).toEqual([researchDocumentId])
  })

  test('a_late_toolbar_save_updates_its_document_title_after_focus_moves', async () => {
    // Catches save completion updating the newly focused Binder item instead of the saved document.
    const wrapper = await splitWorkspace()
    let finish!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => {
      finish = () => resolve({
        id, projectId, ...payload, contentText: '', revision: 1, savedAt: '2026-10-21T00:00:00.000Z',
      })
    }))
    await wrapper.get(`[data-document-pane="${researchDocumentId}"] [aria-label="Document title"]`).setValue('Saved research title')
    await wrapper.get('[aria-label="Save document"]').trigger('click')
    await wrapper.get(`[data-document-pane="${chapterId}"] [aria-label="Document title"]`).trigger('focusin')
    finish()
    await flushPromises()
    expect(wrapper.get(`[data-tab-id="${researchDocumentId}"]`).text()).toContain('Saved research title')
    expect(wrapper.get(`[data-tab-id="${chapterId}"]`).text()).toContain('Chapter One')
    expect(useDocumentStore().sessionFor(researchDocumentId)?.isDirty).toBe(false)
    expect(useWorkspaceStore().activeTabId).toBe(chapterId)
  })

  test.each(['focus', 'edit', 'close'] as const)('delayed_create_preserves_%s_changes_after_the_discard_check', async (transition) => {
    // Catches a delayed create discarding a different tab or edits made after the original guard.
    const wrapper = await mountWorkspaceWithTwoDocuments()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    await wrapper.get('[aria-label="Open Research Notes in new tab"]').trigger('click')
    await flushPromises()
    documents.setNotes(researchDocumentId, 'Keep these research notes')
    await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-title`).trigger('click')
    let finish!: () => void
    vi.spyOn(binderApi, 'create').mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ ...workspace.items[1]!, id: nextDocumentId, title: 'Untitled Document', position: 2 })
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get('[aria-label="New document"]').trigger('click')
    if (transition === 'focus') await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-title`).trigger('click')
    else if (transition === 'close') await wrapper.get(`[data-tab-id="${chapterId}"] .editor-tab-close`).trigger('click')
    else await wrapper.get('[aria-label="Document title"]').setValue('Written during creation')
    const focusedId = workspace.activeTabId
    finish()
    await flushPromises()
    expect(documents.sessionFor(researchDocumentId)?.notesText).toBe('Keep these research notes')
    expect(workspace.activeTabId).toBe(focusedId)
    expect(workspace.activeItemId).toBe(focusedId)
    expect(workspace.items.some((item) => item.id === nextDocumentId)).toBe(true)
    expect(wrapper.find('input[aria-label^="Rename "]').exists()).toBe(false)
    if (transition === 'edit') expect(documents.sessionFor(chapterId)?.title).toBe('Written during creation')
    expect(confirm).not.toHaveBeenCalled()
  })

  test.each([
    ['editor', 'folder'], ['snapshot', 'folder'], ['editor', 'discard'], ['snapshot', 'discard'],
  ] as const)('delayed_%s_save_completion_survives_%s_without_wrong_or_duplicate_title_updates', async (source, transition) => {
    // Catches title completion owned by unmounted presentation and stale completions applied to reopened IDs.
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    let finish!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => {
      finish = () => resolve({ id, projectId, ...payload, contentText: 'Research prose', revision: 1, savedAt: '2026-10-21T00:00:00.000Z' })
    }))
    const createSnapshot = vi.spyOn(snapshotApi, 'create').mockResolvedValue({
      id: nextDocumentId, documentId: researchDocumentId, name: 'Milestone', wordCount: 2, createdAt: '2026-10-21T00:00:00.000Z',
    })
    const updates: string[] = []
    const stop = watch(() => workspace.items, (items) => {
      const title = items.find((item) => item.id === researchDocumentId)?.title
      if (title) updates.push(title)
    }, { flush: 'sync' })
    await wrapper.get(`[data-document-pane="${researchDocumentId}"] [aria-label="Document title"]`).setValue('Saved during suspension')
    if (source === 'editor') {
      await wrapper.get(`[data-document-pane="${researchDocumentId}"] [data-document-editor]`).trigger('keydown', { key: 's', ctrlKey: true })
    } else {
      await wrapper.get('#snapshots-tab').trigger('click')
      await wrapper.get('[aria-label="Take snapshot"]').trigger('click')
      await flushPromises()
      document.querySelector<HTMLButtonElement>('[aria-label="Save and take snapshot"]')!.click()
      await flushPromises()
    }
    if (transition === 'folder') await wrapper.get(`[data-item-id="${folderId}"]`).trigger('click')
    else {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await wrapper.get(`[data-tab-id="${researchDocumentId}"] .editor-tab-close`).trigger('click')
      await wrapper.get('[aria-label="Open Research Notes in new tab"]').trigger('click')
      await flushPromises()
    }
    finish()
    await flushPromises()
    expect(workspace.items.find((item) => item.id === chapterId)?.title).toBe('Chapter One')
    if (transition === 'folder') {
      expect(workspace.activeItemId).toBe(folderId)
      expect(updates).toEqual(['Saved during suspension'])
      expect(documents.sessionFor(researchDocumentId)?.isDirty).toBe(false)
      if (source === 'snapshot') expect(createSnapshot).toHaveBeenCalledOnce()
    } else {
      expect(updates).toEqual([])
      expect(documents.sessionFor(researchDocumentId)?.title).toBe('Research Notes')
      expect(createSnapshot).not.toHaveBeenCalled()
    }
    stop()
  })

  test('conflict_reload_refreshes_the_project_aggregate_for_the_new_server_body_once', async () => {
    // Catches reload replacing the document baseline while leaving the saved project total stale.
    let aggregate = 100
    let progressReads = 0
    const wrapper = await mountWorkspace(1280, (url, init) => {
      if (url.pathname.endsWith('/writing-progress')) {
        progressReads += 1
        return Response.json({ projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions', projectWordCount: aggregate, dailyWordCount: 10, localDate: url.searchParams.get('localDate') })
      }
      if (init?.method === 'PUT') return Response.json({ code: 'DOCUMENT_CONFLICT', message: 'Changed elsewhere', details: { currentRevision: 2, savedAt: '2026-10-21T00:00:00.000Z' } }, { status: 409 })
      if (aggregate !== 100 && url.pathname === `/api/documents/${chapterId}`) return Response.json({
        id: chapterId, projectId, title: 'Server chapter', notesText: '', revision: 2, savedAt: '2026-10-21T00:00:00.000Z',
        contentText: 'A longer server chapter body', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A longer server chapter body' }] }] },
      })
      return workspaceResponse(url)
    })
    await wrapper.get('[aria-label="Document title"]').setValue('Local title')
    await wrapper.get('[aria-label="Save document"]').trigger('click')
    await flushPromises()
    expect(useDocumentStore().sessionFor(chapterId)?.saveState).toBe('conflict')
    const before = progressReads
    aggregate = 103
    const reload = wrapper.findAll('button').find((button) => button.text() === 'Reload server copy')!
    await reload.trigger('click')
    await flushPromises()
    expect(useDocumentStore().sessionFor(chapterId)?.counts.words).toBe(5)
    expect(useWritingProgressStore().projectWordCount).toBe(103)
    expect(progressReads).toBe(before + 1)
    expect(useWritingProgressStore().dailyWordCount).toBe(10)
    expect(wrapper.get(`[data-tab-id="${chapterId}"]`).text()).toContain('Server chapter')
  })

  test.each([false, true])('delayed_subtree_trash_rechecks_new_edits_once_and_keeps_recoverable_buffers_when_declined_%s', async (discard) => {
    // Catches server-confirmed trash silently deleting edits made after its clean preflight.
    const wrapper = await splitWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    const originalItems = structuredClone(workspace.items.map((item) => ({ ...item })))
    const originalProject = { ...workspace.project! }
    const researchSession = documents.sessionFor(researchDocumentId)
    const chapterSession = documents.sessionFor(chapterId)
    let finish!: () => void
    vi.spyOn(binderApi, 'trash').mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ ...originalItems[0]!, trashedAt: '2026-10-21T00:00:00.000Z' })
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(discard)
    await wrapper.get(`[data-item-id="${folderId}"]`).trigger('keydown', { key: 'Delete' })
    expect(confirm).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="Document notes"]').setValue('Research written while trash was pending')
    const chapterEditor = wrapper.get(`[data-document-pane="${chapterId}"] [contenteditable="true"]`)
    chapterEditor.get('p').element.textContent = 'Chapter written while trash was pending'
    await chapterEditor.trigger('input')
    await flushPromises()
    finish()
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(workspace.openDocumentIds).toEqual([])
    expect(workspace.items).toEqual([])
    expect(workspace.activeItemId).toBeNull()
    expect(wrapper.find('[data-document-pane]').exists()).toBe(false)
    expect(wrapper.get('[aria-label="Restore Manuscript"]').exists()).toBe(true)
    if (discard) {
      expect(documents.sessions.size).toBe(0)
      expect(wrapper.find('[data-trash-recovery]').exists()).toBe(false)
      return
    }
    expect(documents.sessionFor(researchDocumentId)).toBe(researchSession)
    expect(documents.sessionFor(chapterId)).toBe(chapterSession)
    expect(wrapper.get('[data-trash-recovery]').text()).toContain('Restore')
    expect(wrapper.get('[aria-label="Permanently delete Manuscript"]').attributes()).toHaveProperty('disabled')
    const remove = vi.spyOn(binderApi, 'delete')
    await workspace.deleteItem(folderId)
    expect(remove).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    const restore = vi.spyOn(binderApi, 'restore')
      .mockRejectedValueOnce(new Error('Restore unavailable'))
      .mockResolvedValueOnce(originalItems[0]!)
      .mockRejectedValueOnce(new ApiRequestError(409, { code: 'BINDER_ITEM_NOT_TRASHED', message: 'Already restored' }))
    vi.spyOn(binderApi, 'getProject')
      .mockRejectedValueOnce(new Error('Refresh unavailable'))
      .mockResolvedValue({ project: originalProject, items: originalItems, trashedItems: [] })
    await wrapper.get('[aria-label="Restore Manuscript"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Restore unavailable')
    expect(wrapper.get('[data-trash-recovery]').exists()).toBe(true)
    expect(documents.sessionFor(chapterId)).toBe(chapterSession)
    await wrapper.get('[aria-label="Restore Manuscript"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Refresh unavailable')
    expect(wrapper.get('[aria-label="Restore Manuscript"]').exists()).toBe(true)
    await wrapper.get('[aria-label="Restore Manuscript"]').trigger('click')
    await flushPromises()
    expect(restore).toHaveBeenCalledTimes(3)
    expect(wrapper.find('[data-trash-recovery]').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.get(`[data-item-id="${researchDocumentId}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Document notes"]').element).toHaveProperty('value', 'Research written while trash was pending')
    await wrapper.get('[aria-label="Open Chapter One in new tab"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[contenteditable="true"]').text()).toBe('Chapter written while trash was pending')
    expect(documents.sessionFor(chapterId)).toBe(chapterSession)
  })

  test('failed_delayed_trash_keeps_edits_and_does_not_create_unreachable_recovery_state', async () => {
    const wrapper = await splitWorkspace()
    let fail!: () => void
    vi.spyOn(binderApi, 'trash').mockImplementation(() => new Promise((_resolve, reject) => {
      fail = () => reject(new Error('Trash unavailable'))
    }))
    await wrapper.get('[aria-label="Move selected item to Trash"]').trigger('click')
    await wrapper.get('[aria-label="Document notes"]').setValue('Keep writing')
    fail()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Trash unavailable')
    expect(wrapper.find('[data-trash-recovery]').exists()).toBe(false)
    expect(useWorkspaceStore().trashedItems).toEqual([])
    expect(useWorkspaceStore().openDocumentIds).toEqual([chapterId, researchDocumentId])
    expect(useDocumentStore().sessionFor(researchDocumentId)?.notesText).toBe('Keep writing')
  })

  test('delayed_trash_does_not_repeat_approval_for_an_unchanged_dirty_buffer', async () => {
    const wrapper = await splitWorkspace()
    await wrapper.get('[aria-label="Document notes"]').setValue('Already approved notes')
    const item = { ...useWorkspaceStore().items.find((candidate) => candidate.id === researchDocumentId)! }
    let finish!: () => void
    vi.spyOn(binderApi, 'trash').mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ ...item, trashedAt: '2026-10-21T00:00:00.000Z' })
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get('[aria-label="Move selected item to Trash"]').trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    finish()
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(useDocumentStore().sessionFor(researchDocumentId)).toBeUndefined()
    expect(wrapper.find('[data-trash-recovery]').exists()).toBe(false)
    expect(useWorkspaceStore().activeTabId).toBe(chapterId)
  })

  test.each([
    ['create', false], ['trash', false], ['trash', true],
  ] as const)('pending_save_baseline_change_invalidates_%s_approval_discard_%s', async (action, discard) => {
    // Saved A → save B pending → revert to clean A → approve action → B saved makes A dirty.
    // Catches approval snapshots that compare only the unchanged editable buffer.
    const wrapper = await mountWorkspace()
    const workspace = useWorkspaceStore()
    const documents = useDocumentStore()
    const session = documents.sessionFor(chapterId)!
    const originalItem = { ...workspace.items.find((item) => item.id === chapterId)! }
    let finishSave!: () => void
    let finishAction!: () => void
    vi.spyOn(documentApi, 'save').mockImplementation((id, payload) => new Promise((resolve) => {
      finishSave = () => resolve({ id, projectId, ...payload, contentText: 'Saved prose', revision: 1, savedAt: '2026-10-21T00:00:00.000Z' })
    }))
    if (action === 'create') {
      vi.spyOn(binderApi, 'create').mockImplementation(() => new Promise((resolve) => {
        finishAction = () => resolve({ ...originalItem, id: nextDocumentId, title: 'New chapter', position: 1 })
      }))
    } else {
      vi.spyOn(binderApi, 'trash').mockImplementation(() => new Promise((resolve) => {
        finishAction = () => resolve({ ...originalItem, title: 'Pending saved title', trashedAt: '2026-10-21T00:00:00.000Z' })
      }))
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(discard).mockReturnValueOnce(true)
    await wrapper.get('[aria-label="Document title"]').setValue('Pending saved title')
    await wrapper.get('[aria-label="Save document"]').trigger('click')
    await wrapper.get('[aria-label="Document title"]').setValue('Chapter One')
    expect(session.isDirty).toBe(false)
    await wrapper.get(action === 'create' ? '[aria-label="New document"]' : '[aria-label="Move selected item to Trash"]').trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    finishSave()
    await flushPromises()
    expect(session.title).toBe('Chapter One')
    expect(session.savedBuffer?.title).toBe('Pending saved title')
    expect(session.isDirty).toBe(true)
    finishAction()
    await flushPromises()
    if (action === 'create') {
      expect(confirm).toHaveBeenCalledOnce()
      expect(workspace.openDocumentIds).toEqual([chapterId, nextDocumentId])
      expect(workspace.activeTabId).toBe(chapterId)
      expect(documents.sessionFor(chapterId)).toBe(session)
    } else {
      expect(confirm).toHaveBeenCalledTimes(2)
      expect(workspace.openDocumentIds).toEqual([])
      expect(workspace.items.some((item) => item.id === chapterId)).toBe(false)
      if (discard) expect(documents.sessionFor(chapterId)).toBeUndefined()
      else {
        expect(documents.sessionFor(chapterId)).toBe(session)
        expect(session.isDirty).toBe(true)
        expect(wrapper.get('[data-trash-recovery]').text()).toContain('Restore')
      }
    }
  })

  test('replaces_the_active_tab_on_a_normal_binder_document_click', async () => {
    // Catches ordinary Binder navigation accumulating tabs instead of reusing the active one.
    const wrapper = await mountWorkspaceWithTwoDocuments()

    expect(wrapper.get('[role="group"][aria-label="Open documents"]').findAll('[data-editor-tab]')).toHaveLength(1)
    await wrapper.get(`[data-item-id="${researchDocumentId}"]`).trigger('click')
    await flushPromises()

    const tabs = wrapper.get('[role="group"][aria-label="Open documents"]').findAll('[data-editor-tab]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.text()).toContain('Research Notes')
    expect(useWorkspaceStore().activeTabId).toBe(researchDocumentId)
  })

  test('opens_switches_and_closes_document_tabs', async () => {
    // Catches the Binder + action replacing a tab, duplicating an open document, or choosing no close neighbor.
    const wrapper = await mountWorkspaceWithTwoDocuments()
    await wrapper.get(`button[aria-label="Open Research Notes in new tab"]`).trigger('click')
    await wrapper.get(`button[aria-label="Open Research Notes in new tab"]`).trigger('click')
    await flushPromises()

    const tablist = wrapper.get('[role="group"][aria-label="Open documents"]')
    expect(tablist.findAll('[data-editor-tab]')).toHaveLength(2)
    expect(tablist.get('button[aria-pressed="true"]').text()).toContain('Research Notes')

    await tablist.get('button[aria-label="Chapter One"]',).trigger('click')
    await flushPromises()
    expect(useWorkspaceStore().activeTabId).toBe('33333333-3333-4333-8333-333333333333')

    const chapterClose = tablist.get('button[aria-label="Close Chapter One"]')
    ;(chapterClose.element as HTMLButtonElement).focus()
    await chapterClose.trigger('click')
    await flushPromises()
    expect(tablist.findAll('[data-editor-tab]')).toHaveLength(1)
    expect(tablist.get('button[aria-pressed="true"]').text()).toContain('Research Notes')
    expect(document.activeElement).toBe(tablist.get('button[aria-label="Research Notes"]').element)
    expect(useWorkspaceStore().activeTabId).toBe(researchDocumentId)

    await tablist.get('button[aria-label="Close Research Notes"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="group"][aria-label="Open documents"]').exists()).toBe(false)
    expect(useWorkspaceStore().activeTabId).toBeNull()
  })

  test('alt_clicking_a_tab_close_button_closes_every_other_tab', async () => {
    // Catches modifier-click closing its own tab or leaving another tab open.
    const wrapper = await mountWorkspaceWithTwoDocuments()
    await wrapper.get(`button[aria-label="Open Research Notes in new tab"]`).trigger('click')
    await flushPromises()

    await wrapper.get('button[aria-label="Close Chapter One"]').trigger('click', { altKey: true })
    await flushPromises()

    const tabs = wrapper.get('[role="group"][aria-label="Open documents"]').findAll('[data-editor-tab]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.text()).toContain('Chapter One')
    expect(useWorkspaceStore().activeTabId).toBe('33333333-3333-4333-8333-333333333333')
  })

  test('switches_tabs_without_prompting_and_keeps_the_outgoing_dirty_buffer', async () => {
    // Catches harmless tab activation prompting or discarding retained session edits.
    const wrapper = await mountWorkspaceWithTwoDocuments()
    await wrapper.get(`button[aria-label="Open Research Notes in new tab"]`).trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Document title"]').setValue('Unsorted research')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await wrapper.get('button[aria-label="Chapter One"]').trigger('click')
    await flushPromises()

    expect(confirm).not.toHaveBeenCalled()
    expect(useWorkspaceStore().activeTabId).toBe(chapterId)
    expect(useDocumentStore().sessionFor(researchDocumentId)?.title).toBe('Unsorted research')
    expect(wrapper.get('[role="group"][aria-label="Open documents"]').findAll('[data-editor-tab]')).toHaveLength(2)
  })

  test('shows_and_retries_a_failed_tab_document_load', async () => {
    // Catches a selected tab rendering a blank editor with no visible recovery action.
    let fail = true
    const wrapper = await mountWorkspaceWithTwoDocuments(() => fail
      ? Response.json({ message: 'Research unavailable' }, { status: 503 })
      : researchDocumentResponse())

    await wrapper.get('button[aria-label="Open Research Notes in new tab"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Research unavailable')

    fail = false
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Research Notes')
  })

  test('disables_outgoing_document_actions_while_another_tab_is_loading', async () => {
    // Catches Inspector or save actions mutating the outgoing buffer during an accepted tab transition.
    let resolveResearch!: (response: Response) => void
    const research = new Promise<Response>((resolve) => { resolveResearch = resolve })
    const wrapper = await mountWorkspaceWithTwoDocuments(() => research)
    await wrapper.get('[aria-label="Document title"]').setValue('Unsaved opening')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await wrapper.get('button[aria-label="Open Research Notes in new tab"]').trigger('click')
    await nextTick()

    expect(wrapper.find('textarea[aria-label="Document notes"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Save document"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="Compile"]').trigger('click')
    expect(wrapper.find('button[aria-label="Save before compile"]').exists()).toBe(false)

    resolveResearch(researchDocumentResponse())
    await flushPromises()
    expect(wrapper.get('textarea[aria-label="Document notes"]').attributes('disabled')).toBeUndefined()
  })

  test('preserves_an_empty_editor_during_a_same_project_refresh', async () => {
    // Catches a refresh reopening the first document after the writer closed the last tab.
    const wrapper = await mountWorkspace()
    await wrapper.get('button[aria-label="Close Chapter One"]').trigger('click')
    await flushPromises()

    const workspace = useWorkspaceStore()
    await workspace.load(projectId)
    await flushPromises()

    expect(workspace.openDocumentIds).toEqual([])
    expect(workspace.activeTabId).toBeNull()
    expect(workspace.activeItemId).toBeNull()
    expect(wrapper.text()).toContain('Select or create a document.')
  })

  test('shows_tooltips_for_every_application_toolbar_button', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const wrapper = await mountWorkspace()
    const cases = [
      ['Back to projects', 'Back to projects'],
      ['Show binder', 'Show binder'],
      ['Compile', 'Show Compile options (Cmd+Shift+E)'],
      ['Focus', 'Enter Focus mode (Cmd+Shift+Enter)'],
      ['Settings', 'Settings'],
      ['Show inspector', 'Show inspector'],
    ] as const

    for (const [buttonLabel, tooltip] of cases) {
      const button = wrapper.get(`button[aria-label="${buttonLabel}"]`)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
      await nextTick()
      expect(wrapper.get('[role="tooltip"]').text()).toBe(tooltip)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseleave'))
      await nextTick()
    }
  })

  test('previews_cancels_and_persists_appearance_settings_from_a_modal', async () => {
    const wrapper = await mountWorkspace()
    const settingsButton = wrapper.get('button[aria-label="Settings"]')

    await settingsButton.trigger('click')
    expect(wrapper.get('[role="dialog"][aria-labelledby]').text()).toContain('Settings')

    await wrapper.get('input[name="editor-font"][value="monospace"]').setValue(true)
    await wrapper.get('input[name="theme"][value="terminal"]').setValue(true)
    expect(document.documentElement.dataset.editorFont).toBe('monospace')
    expect(document.documentElement.dataset.theme).toBe('terminal')
    expect(localStorage.getItem('pluma.appearance.preferences')).toBeNull()

    await wrapper.get('[role="dialog"] button[aria-label="Cancel settings changes"]').trigger('click')
    expect(document.documentElement.dataset.editorFont).toBe('serif')
    expect(document.documentElement.dataset.theme).toBe('helion-dark')
    expect(document.activeElement).toBe(settingsButton.element)

    await settingsButton.trigger('click')
    await wrapper.get('input[name="editor-font"][value="sans-serif"]').setValue(true)
    await wrapper.get('input[name="theme"][value="solarized-light"]').setValue(true)
    await wrapper.get('[role="dialog"] button[aria-label="Save settings"]').trigger('click')

    expect(JSON.parse(localStorage.getItem('pluma.appearance.preferences') ?? '{}')).toEqual({
      editorFont: 'sans-serif',
      theme: 'solarized-light',
    })
    expect(document.documentElement.classList.contains('pluma-dark')).toBe(false)
    expect(document.activeElement).toBe(settingsButton.element)
  })

  test('loads_saved_appearance_settings_and_exposes_an_accessible_modal', async () => {
    localStorage.setItem('pluma.appearance.preferences', JSON.stringify({
      editorFont: 'monospace',
      theme: 'terminal',
    }))
    const wrapper = await mountWorkspace()

    expect(document.documentElement.dataset.editorFont).toBe('monospace')
    expect(document.documentElement.dataset.theme).toBe('terminal')
    expect(document.documentElement.classList.contains('pluma-dark')).toBe(true)

    await wrapper.get('button[aria-label="Settings"]').trigger('click')
    expect(wrapper.get<HTMLInputElement>('input[name="editor-font"][value="monospace"]').element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>('input[name="theme"][value="terminal"]').element.checked).toBe(true)

    const results = await axeCore.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, 'color-contrast-enhanced': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  test('keeps_the_modal_open_and_reports_when_appearance_settings_cannot_be_saved', async () => {
    const nativeSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'pluma.appearance.preferences') throw new DOMException('Storage denied', 'QuotaExceededError')
      nativeSetItem.call(this, key, value)
    })
    const wrapper = await mountWorkspace()

    await wrapper.get('button[aria-label="Settings"]').trigger('click')
    await wrapper.get('input[name="theme"][value="terminal"]').setValue(true)
    await wrapper.get('[role="dialog"] button[aria-label="Save settings"]').trigger('click')

    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('could not be saved')
    expect(document.documentElement.dataset.theme).toBe('terminal')
    expect(localStorage.getItem('pluma.appearance.preferences')).toBeNull()
  })

  test('rolls_back_an_uncommitted_preview_when_the_workspace_unmounts', async () => {
    const wrapper = await mountWorkspace()
    await wrapper.get('button[aria-label="Settings"]').trigger('click')
    await wrapper.get('input[name="theme"][value="terminal"]').setValue(true)
    expect(document.documentElement.dataset.theme).toBe('terminal')

    wrapper.unmount()

    expect(document.documentElement.dataset.theme).toBe('helion-dark')
  })

  test('shows_only_the_hovered_tooltip_when_another_toolbar_action_has_focus', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const wrapper = await mountWorkspace()
    const compile = wrapper.get('button[aria-label="Compile"]')
    const focus = wrapper.get('button[aria-label="Focus"]')
    compile.element.focus()
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Show Compile options (Cmd+Shift+E)')
    focus.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()

    const tooltips = wrapper.findAll('[role="tooltip"]')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]?.text()).toBe('Enter Focus mode (Cmd+Shift+Enter)')
  })

  test('shows_verified_mac_shortcuts_for_every_editor_toolbar_button', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const wrapper = await mountWorkspace()
    const cases = [
      ['Save document', 'Save (Cmd+S)'],
      ['Undo', 'Undo (Cmd+Z)'],
      ['Redo', 'Redo (Cmd+Shift+Z)'],
      ['Paragraph', 'Paragraph (Cmd+Alt+0)'],
      ['Heading 1', 'Heading 1 (Cmd+Alt+1)'],
      ['Heading 2', 'Heading 2 (Cmd+Alt+2)'],
      ['Bold', 'Bold (Cmd+B)'],
      ['Italic', 'Italic (Cmd+I)'],
      ['Underline', 'Underline (Cmd+U)'],
      ['Strikethrough', 'Strikethrough (Cmd+Shift+S)'],
      ['Bullet list', 'Bullet list (Cmd+Shift+8)'],
      ['Numbered list', 'Numbered list (Cmd+Shift+7)'],
      ['Indent', 'Indent (Tab)'],
      ['Outdent', 'Outdent (Shift+Tab)'],
      ['Block quote', 'Block quote (Cmd+Shift+B)'],
      ['Horizontal rule', 'Horizontal rule'],
    ] as const

    for (const [buttonLabel, tooltip] of cases) {
      const button = wrapper.get(`button[aria-label="${buttonLabel}"]`)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
      await nextTick()
      expect(wrapper.get('[role="tooltip"]').text()).toBe(tooltip)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseleave'))
      await nextTick()
    }
  })

  test('uses_windows_and_linux_shortcut_labels_on_non_apple_platforms', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    const wrapper = await mountWorkspace()
    const cases = [
      ['Save document', 'Save (Ctrl+S)'],
      ['Redo', 'Redo (Ctrl+Y)'],
      ['Bold', 'Bold (Ctrl+B)'],
    ] as const

    for (const [buttonLabel, tooltip] of cases) {
      const button = wrapper.get(`button[aria-label="${buttonLabel}"]`)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
      await nextTick()
      expect(wrapper.get('[role="tooltip"]').text()).toBe(tooltip)
      button.element.parentElement?.dispatchEvent(new MouseEvent('mouseleave'))
      await nextTick()
    }
  })

  test('links_a_keyboard-focused_toolbar_button_to_its_tooltip', async () => {
    const wrapper = await mountWorkspace()
    const button = wrapper.get('button[aria-label="Show inspector"]')
    button.element.focus()
    await nextTick()

    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text()).toBe('Show inspector')
    expect(button.attributes('aria-describedby')).toBe(tooltip.attributes('id'))
  })

  test('exposes_pressed_state_only_on_toggle_buttons', async () => {
    const wrapper = await mountWorkspace()

    expect(wrapper.get('button[aria-label="Show binder"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[aria-label="Show inspector"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[aria-label="Back to projects"]').attributes()).not.toHaveProperty('aria-pressed')
    expect(wrapper.get('button[aria-label="Save document"]').attributes()).not.toHaveProperty('aria-pressed')
  })

  test('positions_editor_tooltips_in_the_viewport_outside_the_scrolling_toolbar', async () => {
    const wrapper = await mountWorkspace()
    const button = wrapper.get('button[aria-label="Bold"]')
    vi.spyOn(button.element.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 48,
      top: 48,
      right: 129,
      bottom: 77,
      left: 100,
      width: 29,
      height: 29,
      toJSON: () => ({}),
    })

    button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()

    expect(wrapper.get('[role="tooltip"]').attributes('style')).toContain('top: 81px')
    expect(wrapper.get('[role="tooltip"]').attributes('style')).toContain('left: 114.5px')
  })

  test('dismisses_a_focused_tooltip_when_its_button_becomes_disabled', async () => {
    const wrapper = await mountWorkspace()
    await wrapper.get('[aria-label="Document title"]').setValue('Dirty title')
    const save = wrapper.get('button[aria-label="Save document"]')
    save.element.focus()
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toContain('Save')

    await save.trigger('click')
    await flushPromises()

    expect(save.attributes()).toHaveProperty('disabled')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })

  test('dismisses_a_focused_tooltip_with_escape_without_moving_focus', async () => {
    const wrapper = await mountWorkspace()
    const button = wrapper.get('button[aria-label="Show inspector"]')
    button.element.focus()
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Show inspector')

    await button.trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  test('dismisses_a_hovered_tooltip_with_escape', async () => {
    const wrapper = await mountWorkspace()
    const button = wrapper.get('button[aria-label="Show inspector"]')
    button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Show inspector')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })

  test('dismisses_an_action_tooltip_after_click', async () => {
    const wrapper = await mountWorkspace()
    const button = wrapper.get('button[aria-label="Show inspector"]')
    button.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('Show inspector')

    await button.trigger('click')

    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })

  test('saves_a_dirty_document_with_the_workspace_shortcut', async () => {
    const wrapper = await mountWorkspace()
    const title = wrapper.get<HTMLInputElement>('[aria-label="Document title"]')
    await title.setValue('Shortcut draft')
    expect(useDocumentStore().hasDirtySessions()).toBe(true)

    const shortcut = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    title.element.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(useDocumentStore().hasDirtySessions()).toBe(false)
  })

  test('opens_compile_from_the_workspace_shortcut_and_restores_focus_on_close', async () => {
    const wrapper = await mountWorkspace()
    const title = wrapper.get<HTMLInputElement>('[aria-label="Document title"]')
    title.element.focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'e',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    title.element.dispatchEvent(shortcut)
    await flushPromises()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(shortcut.defaultPrevented).toBe(true)
    expect(dialog?.textContent).toContain('Compile')

    const cancel = Array.from(dialog?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.trim() === 'Cancel')
    cancel?.click()
    await flushPromises()
    expect(title.element).toBe(document.activeElement)
  })

  test('renders_compile_inside_the_workspace_fullscreen_boundary', async () => {
    const wrapper = await mountWorkspace()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'e',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(shortcut)
    await flushPromises()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(wrapper.get('.workspace-shell').element.contains(dialog)).toBe(true)
  })

  test('does_not_enter_focus_mode_while_compile_is_open', async () => {
    const wrapper = await mountWorkspace()
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'e', metaKey: true, shiftKey: true, cancelable: true,
    }))
    await flushPromises()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    const closeButton = dialog?.querySelector<HTMLElement>('button[aria-label="Close"]')
    closeButton?.focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'Enter', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })
    closeButton?.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(wrapper.get('.workspace-shell').classes()).not.toContain('is-focus-mode')
    expect(dialog?.contains(document.activeElement)).toBe(true)
  })

  test('enters_focus_mode_with_the_workspace_shortcut', async () => {
    const wrapper = await mountWorkspace()
    const title = wrapper.get<HTMLInputElement>('[aria-label="Document title"]')
    title.element.focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })

    title.element.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(wrapper.get('.workspace-shell').classes()).toContain('is-focus-mode')
  })

  test('removes_document_tabs_and_split_controls_while_focus_mode_is_active', async () => {
    const wrapper = await mountWorkspace()
    expect(wrapper.find('.editor-tabs').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Split editor"]').exists()).toBe(true)

    await wrapper.get('button[aria-label="Focus"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.editor-tabs').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Split editor"]').exists()).toBe(false)

    await wrapper.get('button[aria-label="Exit focus mode"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.editor-tabs').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Split editor"]').exists()).toBe(true)
  })

  test('keeps_focus_mode_unavailable_when_no_document_editor_is_open', async () => {
    const wrapper = await mountWorkspace()
    const folder = wrapper.get<HTMLElement>('[role="treeitem"][aria-label="Manuscript, folder"]')
    await folder.trigger('click')
    await flushPromises()
    folder.element.focus()
    const shortcut = new KeyboardEvent('keydown', {
      key: 'Enter', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })
    folder.element.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(wrapper.get('button[aria-label="Focus"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('.workspace-shell').classes()).not.toContain('is-focus-mode')
    expect(folder.element).toBe(document.activeElement)
  })

  test('shows_the_app_logo_immediately_before_the_back_button', async () => {
    const wrapper = await mountWorkspace()
    const header = wrapper.get('header[aria-label="Application toolbar"]')
    const logo = header.get('[data-app-logo]')
    const backButton = header.get('button[aria-label="Back to projects"]')

    expect(logo.attributes()).toMatchObject({ alt: '', 'aria-hidden': 'true' })
    expect(logo.classes()).toEqual(expect.arrayContaining(['h-7', 'w-auto']))
    expect(logo.element.nextElementSibling?.contains(backButton.element)).toBe(true)
  })

  test('uses_the_scrivener_ordered_three_pane_frame_and_semantic_landmarks', async () => {
    const wrapper = await mountWorkspace()
    const panes = wrapper.findAll('[data-workspace-pane]')

    expect(panes.map((pane) => pane.attributes('data-workspace-pane'))).toEqual([
      'binder',
      'editor',
      'inspector',
    ])
    expect(wrapper.get('header[aria-label="Application toolbar"]')).toBeTruthy()
    expect(wrapper.get('nav[aria-label="Binder"]')).toBeTruthy()
    expect(wrapper.get('main#main-content')).toBeTruthy()
    expect(wrapper.get('aside[aria-label="Inspector"]')).toBeTruthy()
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(2)
    expect(wrapper.findAll('.card, .eyebrow, [class*="gradient"], [class*="glass"]')).toHaveLength(0)

    const results = await axeCore.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, 'color-contrast-enhanced': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  test('loads_and_persists_keyboard_resized_pane_preferences', async () => {
    localStorage.setItem(
      'pluma.workspace.preferences',
      JSON.stringify({ binderWidth: 264, inspectorWidth: 296, binderOpen: true, inspectorOpen: true }),
    )
    const wrapper = await mountWorkspace()
    expect(wrapper.get('[data-workspace]').attributes('style')).toContain('--binder-width: 264px')

    const binderSeparator = wrapper.get('[aria-label="Resize binder"]')
    await binderSeparator.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.get('[data-workspace]').attributes('style')).toContain('--binder-width: 276px')
    expect(JSON.parse(localStorage.getItem('pluma.workspace.preferences') ?? '{}')).toMatchObject({
      binderWidth: 276,
    })
  })

  test('uses_mutually_exclusive_tablet_sheets_and_single_phone_panels', async () => {
    const tablet = await mountWorkspace(900)
    expect(tablet.get('[data-workspace]').attributes('data-layout')).toBe('tablet')
    await tablet.get('button[aria-label="Show binder"]').trigger('click')
    expect(tablet.get('[data-workspace]').attributes('data-active-panel')).toBe('binder')
    await tablet.get('button[aria-label="Show inspector"]').trigger('click')
    expect(tablet.get('[data-workspace]').attributes('data-active-panel')).toBe('inspector')
    tablet.unmount()

    const phone = await mountWorkspace(600)
    expect(phone.get('[data-workspace]').attributes('data-layout')).toBe('phone')
    expect(phone.get('[data-workspace]').attributes('data-active-panel')).toBe('editor')
    await phone.get('[aria-label="Mobile panel switcher"] button[aria-label="Binder panel"]').trigger('click')
    expect(phone.get('[data-workspace]').attributes('data-active-panel')).toBe('binder')
  })

  test('shows_immediate_folder_contents_in_the_editor_pane', async () => {
    const wrapper = await mountWorkspace()
    await wrapper.get('[role="treeitem"][aria-label="Manuscript, folder"]').trigger('click')

    const contents = wrapper.get('[aria-label="Contents of Manuscript"]')
    expect(contents.text()).toContain('Chapter One')
    expect(contents.text()).not.toContain('No items')
  })

  test('opens_a_child_folder_from_folder_contents', async () => {
    // Catches folder-content navigation sending folder IDs through document-only tab replacement.
    const wrapper = await mountWorkspace()
    const workspace = useWorkspaceStore()
    workspace.items = [...workspace.items, {
      ...workspace.items[0]!,
      id: '88888888-8888-4888-8888-888888888888',
      parentId: '22222222-2222-4222-8222-222222222222',
      title: 'Part One',
      position: 1,
    }]
    await nextTick()
    await wrapper.get('[role="treeitem"][aria-label="Manuscript, folder"]').trigger('click')
    const part = wrapper.get('[aria-label="Contents of Manuscript"]').findAll('button')
      .find((button) => button.text().includes('Part One'))

    await part?.trigger('click')

    expect(workspace.activeItemId).toBe('88888888-8888-4888-8888-888888888888')
    expect(wrapper.get('[aria-label="Contents of Part One"]')).toBeTruthy()
  })

  test('loads progress, overlays unsaved prose, records editor activity, and refreshes after a successful save', async () => {
    // Catches missing lifecycle/event wiring and the saved baseline being double-counted after save.
    let aggregate = 100
    const wrapper = await mountWorkspace(1280, async (url, init) => {
      if (url.pathname.endsWith('/writing-progress')) return Response.json({
        projectWordTarget: null, dailyWordTarget: 1000, dailyCountMode: 'additions',
        projectWordCount: aggregate, dailyWordCount: 10, localDate: url.searchParams.get('localDate'),
      })
      if (init?.method === 'PUT') {
        const input = JSON.parse(String(init.body))
        aggregate = 102
        return Response.json({ ...await workspaceResponse(url).json(), ...input, revision: 1 })
      }
      return workspaceResponse(url)
    })
    const trigger = wrapper.get('[aria-label="Writing progress settings"]')
    await trigger.trigger('mouseenter')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('100 words | 10 words')
    useDocumentStore().setContent(chapterId, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved prose and more' }] }] })
    wrapper.getComponent(DocumentEditor).vm.$emit('word-count-delta', 2)
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('102 words | 12 words')
    await wrapper.get('[aria-label="Save document"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('102 words | 12 words')
    expect(wrapper.get('footer').text()).toContain('4 words · 20 characters')
  })

  test('resets Edit Mode when another project opens and cleans up workspace progress', async () => {
    const wrapper = await mountWorkspace()
    await wrapper.get('[role="switch"][aria-label="Edit Mode"]').trigger('click')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    const router = wrapper.getComponent(WorkspaceView).vm.$router
    await router.push('/projects/44444444-4444-4444-8444-444444444444')
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(useWritingProgressStore().projectId).toBe('44444444-4444-4444-8444-444444444444')
    wrapper.unmount()
    const before = useWritingProgressStore().dailyWordCount
    useWritingProgressStore().recordEditorDelta(3)
    expect(useWritingProgressStore().dailyWordCount).toBe(before)
  })

  test.each([false, true])('guards a dirty document when a project route parameter changes (discard: %s)', async (discard) => {
    // Catches same-component route navigation silently replacing unsaved prose/title state.
    const requests: string[] = []
    const wrapper = await mountWorkspace(1280, (url) => {
      requests.push(url.pathname)
      return workspaceResponse(url)
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(discard)
    await wrapper.get('[aria-label="Document title"]').setValue('Unsaved chapter title')
    await wrapper.get('[role="switch"][aria-label="Edit Mode"]').trigger('click')
    const router = wrapper.getComponent(WorkspaceView).vm.$router
    await router.push(`/projects/${nextProjectId}`)
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    if (discard) {
      expect(router.currentRoute.value.params.projectId).toBe(nextProjectId)
      expect(useWorkspaceStore().project?.id).toBe(nextProjectId)
      expect(useWritingProgressStore().projectId).toBe(nextProjectId)
      expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Chapter Two')
      expect(useDocumentStore().hasDirtySessions()).toBe(false)
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    } else {
      expect(router.currentRoute.value.params.projectId).toBe(projectId)
      expect(useWorkspaceStore().project?.id).toBe(projectId)
      expect(useWritingProgressStore().projectId).toBe(projectId)
      expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Unsaved chapter title')
      expect(useDocumentStore().hasDirtySessions()).toBe(true)
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
      expect(requests.some((request) => request.includes(nextProjectId))).toBe(false)
    }
  })

  test('quarantines the prior project during an accepted switch and shows the new project load failure', async () => {
    // Catches previous-project binder/editor content rendering under a failed new-project route.
    let resolveNext!: (response: Response) => void
    const nextResponse = new Promise<Response>((resolve) => { resolveNext = resolve })
    let retry = false
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/projects/${nextProjectId}` && !retry) return nextResponse
      return workspaceResponse(url)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get('[aria-label="Document title"]').setValue('Discarded old title')
    const workspace = useWorkspaceStore()
    const router = wrapper.getComponent(WorkspaceView).vm.$router
    await router.push(`/projects/${nextProjectId}`)
    await flushPromises()
    expect(router.currentRoute.value.params.projectId).toBe(nextProjectId)
    expect(workspace.project).toBeNull()
    expect(workspace.items).toEqual([])
    expect(workspace.trashedItems).toEqual([])
    expect(workspace.activeItemId).toBeNull()
    expect(useWorkspaceStore().activeTabId).toBeNull()
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    resolveNext(Response.json({ message: 'Next project unavailable' }, { status: 503 }))
    await flushPromises()
    expect(workspace.projectId).toBe(nextProjectId)
    expect(useWritingProgressStore().projectId).toBe(nextProjectId)
    expect(wrapper.get('[role="alert"]').text()).toContain('Next project unavailable')
    expect(wrapper.text()).not.toContain('The Long Draft')
    expect(wrapper.find('[aria-label="Binder"]').exists()).toBe(false)
    expect(wrapper.get('footer').text()).toContain('No selection')
    retry = true
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(workspace.project?.id).toBe(nextProjectId)
    expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Chapter Two')
  })

  test('keeps the current project and dirty buffer when a same-project refresh fails', async () => {
    // Protects refresh behavior while a different-project switch clears stale content.
    let failRefresh = false
    const wrapper = await mountWorkspace(1280, (url) => {
      if (url.pathname === `/api/projects/${projectId}` && failRefresh) {
        return Response.json({ message: 'Refresh unavailable' }, { status: 503 })
      }
      return workspaceResponse(url)
    })
    await wrapper.get('[aria-label="Document title"]').setValue('Still writing')
    const workspace = useWorkspaceStore()
    const selected = workspace.activeItemId
    failRefresh = true
    await workspace.load(projectId)
    await flushPromises()
    expect(workspace.project?.id).toBe(projectId)
    expect(workspace.items).toHaveLength(2)
    expect(workspace.activeItemId).toBe(selected)
    expect(workspace.errorMessage).toBe('Refresh unavailable')
    expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Still writing')
    expect(useDocumentStore().hasDirtySessions()).toBe(true)
  })

  test('refreshes the saved project aggregate after create, trash, restore, and permanent delete', async () => {
    // Catches binder membership mutations leaving the saved project count stale.
    let aggregate = 100
    const detail = await projectResponse().json()
    const item = { ...detail.items[1], id: '55555555-5555-4555-8555-555555555555', title: 'New chapter' }
    const wrapper = await mountWorkspace(1280, (url, init) => {
      if (url.pathname.endsWith('/writing-progress')) return Response.json({
        projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions',
        projectWordCount: aggregate, dailyWordCount: 10, localDate: url.searchParams.get('localDate'),
      })
      if (url.pathname.endsWith('/items') && init?.method === 'POST') { aggregate = 120; return Response.json(item) }
      if (url.pathname.endsWith('/trash')) { aggregate = 100; return Response.json({ ...item, trashedAt: '2026-10-12T00:00:00Z' }) }
      if (url.pathname.endsWith('/restore')) { aggregate = 120; return Response.json(item) }
      if (init?.method === 'DELETE') { aggregate = 99; return new Response(null, { status: 204 }) }
      return workspaceResponse(url)
    })
    const workspace = useWorkspaceStore()
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('mouseenter')
    await workspace.createItem('document', null)
    await flushPromises()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('120 words | 10 words')
    await workspace.trashItem(item.id)
    await flushPromises()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('100 words | 10 words')
    await workspace.restoreItem(item.id)
    await flushPromises()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('120 words | 10 words')
    await workspace.deleteItem(item.id)
    await flushPromises()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('99 words | 10 words')
  })

  test('the open writing settings popover has no accessibility violations', async () => {
    const wrapper = await mountWorkspace()
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('click')
    const results = await axeCore.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, 'color-contrast-enhanced': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})

describe('workspace project loading order', () => {
  function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void; reject: (error: Error) => void } {
    let resolve!: (response: Response) => void
    let reject!: (error: Error) => void
    const promise = new Promise<Response>((fulfill, fail) => { resolve = fulfill; reject = fail })
    return { promise, resolve, reject }
  }

  function installDeferredProjects(older: Promise<Response>, newer: Promise<Response>): void {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === `/api/projects/${projectId}`) return older
      if (url.pathname === `/api/projects/${nextProjectId}`) return newer
      return workspaceResponse(url)
    }))
  }

  afterEach(() => { useWritingProgressStore().dispose() })

  test('retains the newer project and selection when an older project responds later', async () => {
    // Catches an old response overriding current binder contents, selection, and project identity.
    const older = deferredResponse()
    const newer = deferredResponse()
    installDeferredProjects(older.promise, newer.promise)
    const workspace = useWorkspaceStore()
    const oldLoad = workspace.load(projectId)
    const newLoad = workspace.load(nextProjectId)
    newer.resolve(projectResponse(nextProjectId))
    await newLoad
    workspace.activePanel = 'binder'
    workspace.activeItemId = '22222222-2222-4222-8222-222222222222'
    older.resolve(projectResponse())
    await oldLoad
    expect(workspace.projectId).toBe(nextProjectId)
    expect(workspace.project?.id).toBe(nextProjectId)
    expect(workspace.items.every((item) => item.projectId === nextProjectId)).toBe(true)
    expect(workspace.activeItemId).toBe('22222222-2222-4222-8222-222222222222')
    expect(workspace.activePanel).toBe('binder')
    expect(workspace.loading).toBe(false)
    expect(workspace.errorMessage).toBe('')
  })

  test.each(['success', 'failure'])('ignores older %s while the current project is still loading', async (outcome) => {
    // Catches stale finally/catch handlers ending the latest loading state or surfacing the wrong error.
    const older = deferredResponse()
    const newer = deferredResponse()
    installDeferredProjects(older.promise, newer.promise)
    const workspace = useWorkspaceStore()
    const oldLoad = workspace.load(projectId)
    const newLoad = workspace.load(nextProjectId)
    if (outcome === 'success') older.resolve(projectResponse())
    else older.reject(new Error('Older project failed'))
    await oldLoad
    expect(workspace.projectId).toBe(nextProjectId)
    expect(workspace.project).toBeNull()
    expect(workspace.items).toEqual([])
    expect(workspace.activeItemId).toBeNull()
    expect(workspace.loading).toBe(true)
    expect(workspace.errorMessage).toBe('')
    newer.reject(new Error('Current project failed'))
    await newLoad
    expect(workspace.loading).toBe(false)
    expect(workspace.errorMessage).toBe('Current project failed')
  })
})
