import axeCore from 'axe-core'
import PrimeVue from 'primevue/config'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import WorkspaceView from '../src/views/WorkspaceView.vue'
import DocumentEditor from '../src/features/editor/DocumentEditor.vue'
import { useDocumentStore } from '../src/stores/document.js'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const nextProjectId = '44444444-4444-4444-8444-444444444444'
const nextDocumentId = '66666666-6666-4666-8666-666666666666'

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
})

describe('workspace layout', () => {
  test('shows_the_app_logo_immediately_before_the_back_button', async () => {
    const wrapper = await mountWorkspace()
    const header = wrapper.get('header[aria-label="Application toolbar"]')
    const logo = header.get('[data-app-logo]')
    const backButton = header.get('button[aria-label="Back to projects"]')

    expect(logo.attributes()).toMatchObject({ alt: '', 'aria-hidden': 'true' })
    expect(logo.classes()).toEqual(expect.arrayContaining(['h-7', 'w-auto']))
    expect(logo.element.nextElementSibling).toBe(backButton.element)
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
    useDocumentStore().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved prose and more' }] }] })
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
      expect(useDocumentStore().isDirty).toBe(false)
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    } else {
      expect(router.currentRoute.value.params.projectId).toBe(projectId)
      expect(useWorkspaceStore().project?.id).toBe(projectId)
      expect(useWritingProgressStore().projectId).toBe(projectId)
      expect(wrapper.get('[aria-label="Document title"]').element).toHaveProperty('value', 'Unsaved chapter title')
      expect(useDocumentStore().isDirty).toBe(true)
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
    expect(useDocumentStore().documentId).toBeNull()
    expect(wrapper.find('[aria-label="Document editor"]').exists()).toBe(false)
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
    expect(useDocumentStore().isDirty).toBe(true)
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
