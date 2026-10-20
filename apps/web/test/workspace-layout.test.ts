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
  test('shows_tooltips_for_every_application_toolbar_button', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const wrapper = await mountWorkspace()
    const cases = [
      ['Back to projects', 'Back to projects'],
      ['Show binder', 'Show binder'],
      ['Save document', 'Save (Cmd+S)'],
      ['Compile', 'Show Compile options (Cmd+Shift+E)'],
      ['Focus', 'Enter Focus mode (Cmd+Shift+Enter)'],
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
    expect(useDocumentStore().isDirty).toBe(true)

    const shortcut = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    title.element.dispatchEvent(shortcut)
    await flushPromises()

    expect(shortcut.defaultPrevented).toBe(true)
    expect(useDocumentStore().isDirty).toBe(false)
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
