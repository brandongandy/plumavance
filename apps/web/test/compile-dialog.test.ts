import type { BinderItemDto } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import CompileDialog from '../src/features/compile/CompileDialog.vue'
import { useCompile } from '../src/features/compile/useCompile.js'
import { useWorkspaceStore } from '../src/stores/workspace.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const folderId = '22222222-2222-4222-8222-222222222222'
const firstId = '33333333-3333-4333-8333-333333333333'
const secondId = '44444444-4444-4444-8444-444444444444'
const nestedFolderId = '55555555-5555-4555-8555-555555555555'
const stamp = '2026-10-10T00:00:00.000Z'
const item = (id: string, title: string, kind: 'folder' | 'document', parentId: string | null, position: number): BinderItemDto => ({ id, projectId, title, kind, parentId, position, trashedAt: null, createdAt: stamp, updatedAt: stamp })

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => Response.json({ wordCount: 0 }))) })
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
enableAutoUnmount(afterEach)

describe('compile dialog', () => {
  function countDialog(dirty = false) {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({ projectId, items: [item(folderId, 'Manuscript', 'folder', null, 0), item(firstId, 'Opening', 'document', folderId, 0), item(secondId, 'Ending', 'document', null, 1)] })
    return mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
  }

  test('counts_selected_folder_ids_and_clears_to_zero_without_requesting', async () => {
    const fetch = vi.fn(async () => Response.json({ wordCount: 5 }))
    vi.stubGlobal('fetch', fetch)
    countDialog()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('0 words')
    expect(fetch).not.toHaveBeenCalled()
    ;(document.querySelector<HTMLInputElement>(`input[value="${folderId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(`/api/projects/${projectId}/compile/word-count`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ itemIds: [folderId, firstId] }), signal: expect.any(AbortSignal) }))
    expect(document.querySelector('[aria-label="Compile order"]')?.textContent).toContain('Order5 words')
    ;(document.querySelector<HTMLInputElement>(`input[value="${folderId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('0 words')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('keeps_the_latest_count_when_aborted_requests_resolve_out_of_order', async () => {
    const requests: { resolve: (response: Response) => void; signal: AbortSignal }[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((resolve) => requests.push({ resolve, signal: options.signal as AbortSignal }))))
    countDialog()
    await flushPromises()
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('Counting…')
    ;(document.querySelector<HTMLInputElement>(`input[value="${secondId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(requests[0]?.signal.aborted).toBe(true)
    requests[1]?.resolve(Response.json({ wordCount: 8 }))
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('8 words')
    requests[0]?.resolve(Response.json({ wordCount: 3 }))
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('8 words')
  })

  test('shows_a_count_error_without_disabling_compile_or_replacing_compile_errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'COUNT_FAILED', message: 'Word count unavailable.' }, { status: 503 })))
    const wrapper = countDialog()
    await wrapper.setProps({ error: 'Pandoc failed.' })
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile order"] [role="alert"]')?.textContent).toContain('Word count unavailable.')
    expect(document.body.textContent).toContain('Pandoc failed.')
    const compile = document.querySelector<HTMLButtonElement>('[aria-label="Compile download"]') as HTMLButtonElement
    expect(compile.disabled).toBe(false)
    compile.click()
    await flushPromises()
    expect(wrapper.emitted('compile')?.[0]?.[0]).toMatchObject({ itemIds: [firstId] })
  })

  test('counts_saved_copy_only_after_the_dirty_gate_and_refreshes_after_save', async () => {
    const fetch = vi.fn(async () => Response.json({ wordCount: 5 }))
    vi.stubGlobal('fetch', fetch)
    const wrapper = countDialog(true)
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    ;(document.querySelector<HTMLButtonElement>('[aria-label="Compile saved copy"]') as HTMLButtonElement).click()
    await flushPromises()
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('5 words')
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValue(Response.json({ wordCount: 7 }))
    await wrapper.setProps({ dirty: false })
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('7 words')
  })

  test('waits_for_a_successful_save_to_open_the_dirty_gate', async () => {
    const fetch = vi.fn(async () => Response.json({ wordCount: 7 }))
    vi.stubGlobal('fetch', fetch)
    const wrapper = countDialog(true)
    await flushPromises()
    ;(document.querySelector<HTMLButtonElement>('[aria-label="Save before compile"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Save changes before compiling?')
    await wrapper.setProps({ dirty: false })
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('7 words')
  })

  test('aborts_on_close_and_ignores_a_late_response_after_reopening', async () => {
    let resolveCount!: (response: Response) => void
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(() => new Promise<Response>((resolve) => { resolveCount = resolve }))
    vi.stubGlobal('fetch', fetch)
    const wrapper = countDialog()
    await flushPromises()
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    await wrapper.setProps({ visible: false })
    expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(true)
    await wrapper.setProps({ visible: true })
    resolveCount(Response.json({ wordCount: 99 }))
    await flushPromises()
    expect(document.querySelector('[aria-label="Compile word count"]')?.textContent).toBe('0 words')
  })

  test('defaults_scene_and_chapter_break_controls', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({ projectId, items: [item(firstId, 'Opening', 'document', folderId, 0)] })
    mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()

    const sceneSeparator = document.querySelector<HTMLInputElement>('input[aria-label="Scene separator"]')
    const chapterPageBreaks = document.querySelector<HTMLInputElement>('input[aria-label="Chapter page breaks"]')

    expect(sceneSeparator?.value).toBe('#')
    expect(sceneSeparator?.maxLength).toBe(20)
    expect(chapterPageBreaks?.checked).toBe(true)
    expect(document.querySelector('[aria-label="Compile order"]')?.textContent).toContain('Select a chapter or scene.')
  })

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
    const folderTitles = [...document.querySelectorAll('label')].find((label) => label.textContent?.includes('Include chapter titles'))?.querySelector('input') as HTMLInputElement
    const documentTitles = [...document.querySelectorAll('label')].find((label) => label.textContent?.includes('Include scene titles'))?.querySelector('input') as HTMLInputElement
    const sceneSeparator = document.querySelector<HTMLInputElement>('input[aria-label="Scene separator"]') as HTMLInputElement
    const chapterPageBreaks = document.querySelector<HTMLInputElement>('input[aria-label="Chapter page breaks"]') as HTMLInputElement
    expect(folderTitles.checked).toBe(true)
    folderTitles.click()
    expect(documentTitles.checked).toBe(true)
    sceneSeparator.value = '* * *'; sceneSeparator.dispatchEvent(new Event('input', { bubbles: true }))
    chapterPageBreaks.click()
    submit.click(); await flushPromises()
    expect(wrapper.emitted('compile')?.[0]?.[0]).toMatchObject({
      itemIds: [folderId, firstId],
      format: 'markdown',
      filename: 'Novel Draft',
      includeFolderTitles: false,
      sceneSeparator: '* * *',
      chapterPageBreaks: false,
    })
  })

  test('selects_all_items_and_cascades_folder_selection_in_both_directions', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({
      projectId,
      items: [
        item(folderId, 'Part One', 'folder', null, 0),
        item(nestedFolderId, 'Act One', 'folder', folderId, 0),
        item(firstId, 'Opening', 'document', nestedFolderId, 0),
        item(secondId, 'Ending', 'document', null, 1),
      ],
    })
    mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()

    const selectAll = document.querySelector<HTMLButtonElement>('button[aria-label="Select all compile items"]')
    expect(selectAll).toBeTruthy()
    selectAll?.click()
    await flushPromises()
    expect([...document.querySelectorAll<HTMLInputElement>('.compile-selection input[type="checkbox"]')].every((input) => input.checked)).toBe(true)

    ;(document.querySelector<HTMLInputElement>(`input[value="${nestedFolderId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>(`input[value="${folderId}"]`)?.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>(`input[value="${nestedFolderId}"]`)?.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`)?.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>(`input[value="${secondId}"]`)?.checked).toBe(true)

    ;(document.querySelector<HTMLInputElement>(`input[value="${folderId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>(`input[value="${nestedFolderId}"]`)?.checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`)?.checked).toBe(true)

    document.querySelector<HTMLButtonElement>('button[aria-label="Select all compile items"]')?.click()
    await flushPromises()
    const clearAll = document.querySelector<HTMLButtonElement>('button[aria-label="Clear compile selection"]')
    expect(clearAll).toBeTruthy()
    clearAll?.click()
    await flushPromises()
    expect([...document.querySelectorAll<HTMLInputElement>('.compile-selection input[type="checkbox"]')].every((input) => !input.checked)).toBe(true)

    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`)?.checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>(`input[value="${nestedFolderId}"]`)?.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>(`input[value="${folderId}"]`)?.checked).toBe(false)
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
    const createObjectURL = vi.fn(() => 'blob:pluma')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('draft', { headers: { 'content-disposition': 'attachment; filename="Draft.md"' } })))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const compile = useCompile()
    await compile.compile(projectId, { itemIds: [firstId], exportType: 'manuscript', format: 'markdown', includeTitles: true, includeFolderTitles: true, sceneSeparator: '#', chapterPageBreaks: true, filename: 'Draft' })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pluma')
    expect(compile.error.value).toBe('')
  })

  test('offers_export_specific_formats_and_ereader_fonts', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({ projectId, items: [item(firstId, 'Opening', 'document', null, 0)] })
    const wrapper = mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()

    expect(document.querySelector<HTMLInputElement>('input[value="manuscript"]')?.checked).toBe(true)
    expect(document.querySelector('input[value="epub"]')).toBeNull()
    expect(document.querySelector('fieldset[aria-label="E-reader font"]')).toBeNull()

    ;(document.querySelector<HTMLInputElement>('input[value="ereader"]') as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('input[value="epub"]')).toBeTruthy()
    expect(document.querySelector('input[value="rtf"]')).toBeNull()
    expect(document.querySelector('fieldset[aria-label="E-reader font"]')).toBeTruthy()
    expect(document.querySelector('fieldset[aria-label="E-reader font"]')?.textContent).toContain('Literata')
    expect(document.querySelector('fieldset[aria-label="E-reader font"]')?.textContent).toContain('IBM Plex Sans')
    expect(document.querySelector('fieldset[aria-label="E-reader font"]')?.textContent).toContain('IBM Plex Mono')

    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    ;(document.querySelector<HTMLInputElement>('input[value="epub"]') as HTMLInputElement).click()
    ;(document.querySelector<HTMLInputElement>('input[value="sans-serif"]') as HTMLInputElement).click()
    await flushPromises()
    ;(document.querySelector<HTMLButtonElement>('button[aria-label="Compile download"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.emitted('compile')?.[0]?.[0]).toMatchObject({ exportType: 'ereader', format: 'epub', font: 'sans-serif' })
  })

  test('selects_a_paperback_size_for_ereader_pdfs', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({ projectId, items: [item(firstId, 'Opening', 'document', null, 0)] })
    const wrapper = mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()

    expect(document.querySelector('[aria-label="Paperback size"]')).toBeNull()
    ;(document.querySelector<HTMLInputElement>('input[value="ereader"]') as HTMLInputElement).click()
    await flushPromises()

    const pageSize = document.querySelector<HTMLSelectElement>('[aria-label="Paperback size"]') as HTMLSelectElement
    expect(pageSize.value).toBe('digest')
    expect([...pageSize.options].map((option) => option.text)).toEqual([
      'Mass-market paperback — 4.25″ × 6.87″',
      'Digest — 5.06″ × 7.81″',
      'Trade — 6″ × 9″',
    ])
    pageSize.value = 'trade'
    pageSize.dispatchEvent(new Event('change', { bubbles: true }))

    ;(document.querySelector<HTMLInputElement>('input[value="epub"]') as HTMLInputElement).click()
    await flushPromises()
    expect(document.querySelector('[aria-label="Paperback size"]')).toBeNull()
    ;(document.querySelector<HTMLInputElement>('input[value="pdf"]') as HTMLInputElement).click()
    ;(document.querySelector<HTMLInputElement>(`input[value="${firstId}"]`) as HTMLInputElement).click()
    await flushPromises()
    ;(document.querySelector<HTMLButtonElement>('button[aria-label="Compile download"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.emitted('compile')?.[0]?.[0]).toMatchObject({ exportType: 'ereader', format: 'pdf', pageSize: 'trade' })
  })

  test('resets_an_incompatible_format_when_export_type_changes', async () => {
    const pinia = createPinia(); setActivePinia(pinia)
    useWorkspaceStore().$patch({ projectId, items: [item(firstId, 'Opening', 'document', null, 0)] })
    mount(CompileDialog, { attachTo: document.body, props: { visible: true, dirty: false }, global: { plugins: [pinia, [PrimeVue, { unstyled: true }]] } })
    await flushPromises()

    ;(document.querySelector<HTMLInputElement>('input[value="markdown"]') as HTMLInputElement).click()
    ;(document.querySelector<HTMLInputElement>('input[value="ereader"]') as HTMLInputElement).click()
    await flushPromises()

    expect(document.querySelector<HTMLInputElement>('input[value="pdf"]')?.checked).toBe(true)
  })
})
