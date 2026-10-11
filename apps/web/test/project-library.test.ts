import axeCore from 'axe-core'
import PrimeVue from 'primevue/config'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import ProjectLibraryView from '../src/views/ProjectLibraryView.vue'

interface ProjectFixture {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string
}

const first: ProjectFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Newest project',
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:02.000Z',
  lastOpenedAt: '2026-10-10T00:00:02.000Z',
}
const second: ProjectFixture = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Older project',
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  lastOpenedAt: '2026-10-09T00:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function runAxe(): ReturnType<typeof axeCore.run> {
  return axeCore.run(document.body, {
    rules: {
      'color-contrast': { enabled: false },
      'color-contrast-enhanced': { enabled: false },
    },
  })
}

function createProjectApi(initial: ProjectFixture[] = [first, second]): {
  fetch: ReturnType<typeof vi.fn>
  projects: ProjectFixture[]
} {
  const projects = [...initial]
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    if (path === '/api/projects' && method === 'GET') return jsonResponse(projects)
    if (path === '/api/projects' && method === 'POST') {
      const payload = JSON.parse(String(init?.body)) as { name: string }
      const created = { ...first, id: '33333333-3333-4333-8333-333333333333', name: payload.name }
      projects.unshift(created)
      return jsonResponse(created, 201)
    }
    const match = path.match(/^\/api\/projects\/([^/]+)$/)
    if (match && method === 'PATCH') {
      const payload = JSON.parse(String(init?.body)) as { name: string }
      const project = projects.find((candidate) => candidate.id === match[1]) as ProjectFixture
      project.name = payload.name
      return jsonResponse(project)
    }
    if (match && method === 'DELETE') {
      const index = projects.findIndex((candidate) => candidate.id === match[1])
      projects.splice(index, 1)
      return new Response(null, { status: 204 })
    }
    return jsonResponse({ code: 'NOT_FOUND', message: 'Not found.' }, 404)
  })
  return { fetch, projects }
}

async function mountLibrary(fetchImplementation: typeof fetch): Promise<{
  wrapper: VueWrapper
  router: Router
}> {
  vi.stubGlobal('fetch', fetchImplementation)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ProjectLibraryView },
      { path: '/projects/:projectId', component: { template: '<main>Workspace</main>' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(ProjectLibraryView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]] },
  })
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project library', () => {
  test('renders_the_compact_server_order_and_opens_a_project', async () => {
    const api = createProjectApi()
    const { wrapper, router } = await mountLibrary(api.fetch as typeof fetch)
    const rows = wrapper.findAll('[data-project-row]')

    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining('Newest project'),
      expect.stringContaining('Older project'),
    ])
    expect(wrapper.findAll('.eyebrow, .hero, .card, [class*="gradient"], [class*="glass"]')).toHaveLength(0)

    await rows[0]?.find('button[aria-label="Open Newest project"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/projects/${first.id}`)
  })

  test('creates_a_trimmed_project_and_rejects_a_blank_name', async () => {
    const api = createProjectApi([])
    const { wrapper } = await mountLibrary(api.fetch as typeof fetch)

    await wrapper.get('button[aria-label="Create project"]').trigger('click')
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Project name"]') as HTMLInputElement
    const submit = document.querySelector<HTMLButtonElement>('button[aria-label="Confirm create project"]') as HTMLButtonElement
    input.value = '   '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(submit.disabled).toBe(true)

    input.value = '  New manuscript  '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const enabledCreate = document.querySelector('button[aria-label="Confirm create project"]') as HTMLButtonElement
    expect(enabledCreate.disabled).toBe(false)
    enabledCreate.click()
    await flushPromises()

    expect(api.fetch).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New manuscript' }) }),
    )
    expect(wrapper.text()).toContain('New manuscript')
  })

  test('renames_and_deletes_with_confirmation_then_restores_trigger_focus', async () => {
    const api = createProjectApi()
    const { wrapper } = await mountLibrary(api.fetch as typeof fetch)
    const renameTrigger = wrapper.get('button[aria-label="Rename Newest project"]')

    await renameTrigger.trigger('click')
    const renameInput = document.querySelector<HTMLInputElement>('input[aria-label="Project name"]') as HTMLInputElement
    renameInput.value = 'Revised project'
    renameInput.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.querySelector('button[aria-label="Confirm rename project"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.text()).toContain('Revised project')
    expect(document.activeElement).toBe(renameTrigger.element)

    const deleteTrigger = wrapper.get('button[aria-label="Delete Revised project"]')
    await deleteTrigger.trigger('click')
    const deleteButton = document.querySelector<HTMLButtonElement>('button[aria-label="Confirm delete project"]') as HTMLButtonElement
    expect(deleteButton.disabled).toBe(true)
    const confirmation = document.querySelector<HTMLInputElement>('input[aria-label="Type project name to confirm"]') as HTMLInputElement
    confirmation.value = 'Revised project'
    confirmation.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const enabledDelete = document.querySelector('button[aria-label="Confirm delete project"]') as HTMLButtonElement
    expect(enabledDelete.disabled).toBe(false)
    enabledDelete.click()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Revised project')
  })

  test('shows_loading_empty_and_error_states_without_accessibility_violations', async () => {
    let resolveProjects: ((response: Response) => void) | undefined
    const pending = new Promise<Response>((resolve) => {
      resolveProjects = resolve
    })
    const loadingFetch = vi.fn(() => pending)
    const mounted = await mountLibrary(loadingFetch as typeof fetch)
    expect(mounted.wrapper.get('[role="status"]').text()).toBe('Loading projects…')
    resolveProjects?.(jsonResponse([]))
    await flushPromises()
    expect(mounted.wrapper.text()).toContain('No projects.')
    expect((await runAxe()).violations).toEqual([])
    mounted.wrapper.unmount()

    const failingFetch = vi.fn(async () => jsonResponse({ code: 'LOAD_FAILED', message: 'Could not load projects.' }, 500))
    const failed = await mountLibrary(failingFetch as typeof fetch)
    expect(failed.wrapper.get('[role="alert"]').text()).toContain('Could not load projects.')
    expect((await runAxe()).violations).toEqual([])

    await failed.wrapper.get('button[aria-label="Create project"]').trigger('click')
    await flushPromises()
    expect((await runAxe()).violations).toEqual([])
  })
})
