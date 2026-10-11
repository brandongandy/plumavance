import type { BinderItemDto } from '@scr/shared'
import PrimeVue from 'primevue/config'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import CompileDialog from '../src/features/compile/CompileDialog.vue'
import { useCompile } from '../src/features/compile/useCompile.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const folderId = '22222222-2222-4222-8222-222222222222'
const firstId = '33333333-3333-4333-8333-333333333333'
const secondId = '44444444-4444-4444-8444-444444444444'
const stamp = '2026-10-10T00:00:00.000Z'
const item = (id: string, title: string, kind: 'folder' | 'document', parentId: string | null, position: number): BinderItemDto => ({ id, projectId, title, kind, parentId, position, trashedAt: null, createdAt: stamp, updatedAt: stamp })

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('compile dialog', () => {
  test('selects_folders_previews_binder_order_and_submits_valid_options', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useWorkspaceStore()
    store.$patch({ projectId, items: [item(folderId, 'Manuscript', 'folder', null, 0), item(firstId, 'Opening', 'document', folderId, 0), item(secondId, 'Ending', 'document', null, 1)] })
    const wrapper = mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()
    const submit = document.querySelector<HTMLButtonElement>('button[aria-label="Compile download"]') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    ;(document.querySelector(`input[value="${folderId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile order"]')?.textContent).toContain('Opening')
    expect(document.querySelector('[aria-label="Compile order"]')?.textContent).not.toContain('Ending')
    const filename = document.querySelector<HTMLInputElement>('input[aria-label="Export filename"]') as HTMLInputElement
    filename.value = 'Novel Draft'; filename.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.querySelector<HTMLInputElement>('input[value="markdown"]') as HTMLInputElement).click()
    submit.click(); await flushPromises()
    expect(wrapper.emitted('compile')?.[0]?.[0]).toMatchObject({ itemIds: [folderId], format: 'markdown', filename: 'Novel Draft' })
  })

  test('gates_dirty_content_with_save_saved_copy_or_cancel_and_reports_errors', async () => {
    const pinia = createPinia(); setActivePinia(pinia); useWorkspaceStore().$patch({ projectId, items: [item(firstId, 'Opening', 'document', null, 0)] })
    mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: true, error: 'Pandoc failed.' }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()
    expect(document.body.textContent).toContain('Save changes before compiling?')
    expect(document.querySelector('button[aria-label="Save before compile"]')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Compile saved copy"]')).toBeTruthy()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Pandoc failed.')
  })

  test('downloads_the_response_filename_and_revokes_the_object_url', async () => {
    const createObjectURL = vi.fn(() => 'blob:scr')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('draft', { headers: { 'content-disposition': 'attachment; filename="Draft.md"' } })))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const compile = useCompile()
    await compile.compile(projectId, { itemIds: [firstId], format: 'markdown', includeTitles: true, separateDocuments: true, filename: 'Draft' })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scr')
    expect(compile.error.value).toBe('')
  })
})
