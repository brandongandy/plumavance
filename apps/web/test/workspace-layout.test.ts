import axeCore from 'axe-core'
import PrimeVue from 'primevue/config'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import WorkspaceView from '../src/views/WorkspaceView.vue'

const projectId = '11111111-1111-4111-8111-111111111111'

function projectResponse(): Response {
  return Response.json({
    project: {
      id: projectId,
      name: 'The Long Draft',
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      lastOpenedAt: '2026-10-10T00:00:00.000Z',
    },
    items: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        projectId,
        parentId: null,
        kind: 'folder',
        title: 'Manuscript',
        position: 0,
        trashedAt: null,
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        projectId,
        parentId: '22222222-2222-4222-8222-222222222222',
        kind: 'document',
        title: 'Chapter One',
        position: 0,
        trashedAt: null,
        createdAt: '2026-10-10T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      },
    ],
    trashedItems: [],
  })
}

async function mountWorkspace(width = 1280): Promise<VueWrapper> {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  vi.stubGlobal('fetch', vi.fn(async () => projectResponse()))
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
  return wrapper
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('workspace layout', () => {
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
      'scr.workspace.preferences',
      JSON.stringify({ binderWidth: 264, inspectorWidth: 296, binderOpen: true, inspectorOpen: true }),
    )
    const wrapper = await mountWorkspace()
    expect(wrapper.get('[data-workspace]').attributes('style')).toContain('--binder-width: 264px')

    const binderSeparator = wrapper.get('[aria-label="Resize binder"]')
    await binderSeparator.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.get('[data-workspace]').attributes('style')).toContain('--binder-width: 276px')
    expect(JSON.parse(localStorage.getItem('scr.workspace.preferences') ?? '{}')).toMatchObject({
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
})
