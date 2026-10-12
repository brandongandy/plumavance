import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import StatusBar from '../src/components/layout/StatusBar.vue'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const wrappers: VueWrapper[] = []
let settings = { projectWordTarget: 80000 as number | null, dailyWordTarget: 1000 as number | null, dailyCountMode: 'additions' }
let failSettings = false
let failActivity = false

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  settings = { projectWordTarget: 80000, dailyWordTarget: 1000, dailyCountMode: 'additions' }
  failSettings = false
  failActivity = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/word-count-events')) {
      if (failActivity) return Response.json({ message: 'Activity could not be synced.' }, { status: 503 })
      const event = JSON.parse(String(init?.body))
      return Response.json({ localDate: event.localDate, dailyWordCount: 612 + event.delta })
    }
    if (url.pathname.endsWith('/writing-settings')) {
      if (failSettings) return Response.json({ message: 'Settings could not be saved.' }, { status: 503 })
      settings = { ...settings, ...JSON.parse(String(init?.body)) }
      return Response.json({ id: projectId, name: 'Draft', createdAt: '', updatedAt: '', lastOpenedAt: '', ...settings })
    }
    return Response.json({ ...settings, projectWordCount: 34870, dailyWordCount: 612, localDate: url.searchParams.get('localDate') })
  }))
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  useWritingProgressStore().dispose()
  vi.unstubAllGlobals()
})

async function statusBar(): Promise<VueWrapper> {
  const store = useWritingProgressStore()
  await store.load(projectId)
  const wrapper = mount(StatusBar, {
    attachTo: document.body,
    props: { itemTitle: 'Chapter One', saveState: 'saved', words: 57, characters: 234, projectWords: 34870 },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('writing status controls', () => {
  test('shows exact live project and daily counts in the opened settings for touch users', async () => {
    const wrapper = await statusBar()
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('click')
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain('Project: 34,870 words')
    expect(dialog.text()).toContain('Today: 612 words')
    useWritingProgressStore().recordEditorDelta(5)
    await nextTick()
    expect(dialog.text()).toContain('Today: 617 words')
  })
  test('shows live daily progress and exact counts on hover and keyboard focus without changing document counts', async () => {
    // Catches a missing live bar, incorrect target semantics, or losing current-document counts.
    const wrapper = await statusBar()
    const progress = wrapper.get('[role="progressbar"]')
    expect(progress.attributes('aria-valuenow')).toBe('612')
    expect(progress.attributes('aria-valuemax')).toBe('1000')
    expect(wrapper.get('.writing-progress-fill').attributes('style')).toContain('61.2%')
    expect(wrapper.text()).toContain('57 words · 234 characters')
    const trigger = wrapper.get('[aria-label="Writing progress settings"]')
    await trigger.trigger('mouseenter')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('34,870 words | 612 words')
    await trigger.trigger('mouseleave')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    ;(trigger.element as HTMLElement).focus()
    await nextTick()
    expect(wrapper.get('[role="tooltip"]').text()).toBe('34,870 words | 612 words')
    useWritingProgressStore().recordEditorDelta(500)
    await nextTick()
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1000')
    expect(wrapper.get('.writing-progress-fill').attributes('style')).toContain('100%')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('34,870 words | 1,112 words')
  })

  test('leaves targets unset and renders a neutral bar without a fabricated maximum', async () => {
    settings.projectWordTarget = null
    settings.dailyWordTarget = null
    const wrapper = await statusBar()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.get('.writing-progress-track').attributes('aria-label')).toBe('Daily word target not set')
    expect(wrapper.get('.writing-progress-fill').attributes('style')).toContain('0%')
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('click')
    expect(wrapper.get('[aria-label="Project word target"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[aria-label="Daily word target"]').element).toHaveProperty('value', '')
  })

  test('saves optional targets and net mode, clears targets independently, and restores focus on Escape', async () => {
    settings.projectWordTarget = null
    settings.dailyWordTarget = null
    const wrapper = await statusBar()
    const trigger = wrapper.get('[aria-label="Writing progress settings"]')
    await trigger.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Project word target"]').element)
    await wrapper.get('[aria-label="Project word target"]').setValue('80000')
    await wrapper.get('[aria-label="Daily word target"]').setValue('1000')
    await wrapper.get('[aria-label="Daily count mode"]').setValue('net')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(useWritingProgressStore().dailyCountMode).toBe('net')
    expect(useWritingProgressStore().projectWordTarget).toBe(80000)
    expect(useWritingProgressStore().dailyWordTarget).toBe(1000)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await trigger.trigger('click')
    await wrapper.get('[aria-label="Project word target"]').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(useWritingProgressStore().projectWordTarget).toBeNull()
    expect(useWritingProgressStore().dailyWordTarget).toBe(1000)
    await trigger.trigger('click')
    await wrapper.get('[aria-label="Daily word target"]').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(useWritingProgressStore().dailyWordTarget).toBeNull()
    await trigger.trigger('click')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  test.each(['0', '-1', '1.5', 'invalid'])('retains invalid target %s and shows validation', async (value) => {
    // Catches silently converting invalid input into a cleared or rounded target.
    const wrapper = await statusBar()
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('click')
    await wrapper.get('[aria-label="Daily word target"]').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('positive whole number')
    expect(wrapper.get('[aria-label="Daily word target"]').element).toHaveProperty('value', value)
    expect(useWritingProgressStore().dailyWordTarget).toBe(1000)
  })

  test('keeps API errors and unsynced state visible without losing the settings draft', async () => {
    const wrapper = await statusBar()
    failActivity = true
    useWritingProgressStore().recordEditorDelta(1)
    await useWritingProgressStore().flush()
    await wrapper.get('[aria-label="Writing progress settings"]').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Not synced')
    failSettings = true
    await wrapper.get('[aria-label="Daily word target"]').setValue('2000')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Settings could not be saved.')
    expect(wrapper.get('[aria-label="Daily word target"]').element).toHaveProperty('value', '2000')
  })

  test('toggles the adjacent labeled Edit Mode switch and clamps negative net progress', async () => {
    const wrapper = await statusBar()
    const toggle = wrapper.get('[role="switch"][aria-label="Edit Mode"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.classes()).toContain('is-enabled')
    useWritingProgressStore().recordEditorDelta(50)
    await nextTick()
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('612')
    await toggle.trigger('click')
    useWritingProgressStore().dailyCountMode = 'net'
    useWritingProgressStore().recordEditorDelta(-700)
    await nextTick()
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
    expect(wrapper.get('.writing-progress-fill').attributes('style')).toContain('0%')
  })

  test('leaves Escape available to the workspace when the settings popover is closed', async () => {
    // Catches the control hijacking Escape and focus while a writer uses Edit Mode or Focus Mode.
    const wrapper = await statusBar()
    const toggle = wrapper.get('[role="switch"]')
    ;(toggle.element as HTMLElement).focus()
    await nextTick()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    toggle.element.dispatchEvent(escape)
    await nextTick()
    expect(escape.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(toggle.element)
  })
})
