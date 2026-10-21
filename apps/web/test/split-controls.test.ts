import axeCore from 'axe-core'
import PrimeVue from 'primevue/config'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import EditorTabs from '../src/features/editor/EditorTabs.vue'
import SplitDivider from '../src/features/editor/SplitDivider.vue'
import type { SplitOrientation } from '../src/stores/workspace.js'

const tabs = [
  { id: 'first', title: 'Chapter One' },
  { id: 'second', title: 'Research Notes' },
  { id: 'third', title: 'Chapter Two' },
]
const wrappers: VueWrapper[] = []

function mountTabs(props = {}) {
  const wrapper = mount(EditorTabs, {
    props: { tabs, activeId: 'second', splitIds: ['first', 'second'], splitOrientation: 'vertical', ...props },
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function mountDivider(orientation: SplitOrientation = 'vertical', props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 100, y: 80, left: 100, top: 80, width: 800, height: 400, right: 900, bottom: 480,
    toJSON: () => ({}),
  })
  const wrapper = mount(SplitDivider, { props: { orientation, value: 0.5, ...props }, attachTo: container })
  // Vue Test Utils adds a mount root; the divider's actual parent is the split container in production.
  vi.spyOn(wrapper.element.parentElement!, 'getBoundingClientRect').mockReturnValue(container.getBoundingClientRect())
  wrappers.push(wrapper)
  return wrapper
}

function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1, button = 0) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  target.dispatchEvent(event)
}

describe('split divider', () => {
  test.each(['vertical', 'horizontal'] as const)('exposes_a_focusable_%s_separator_with_percentage_values', async (orientation) => {
    const wrapper = mountDivider(orientation, { value: 0.35 })
    const separator = wrapper.get('[role="separator"]')
    expect(separator.attributes()).toMatchObject({
      'aria-label': 'Resize split', 'aria-orientation': orientation, tabindex: '0',
      'aria-valuemin': '20', 'aria-valuemax': '80', 'aria-valuenow': '35',
    })
    await wrapper.setProps({ value: 0.65 })
    expect(separator.attributes('aria-valuenow')).toBe('65')
    const result = await axeCore.run(wrapper.element, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })

  test.each([
    { orientation: 'vertical', key: 'ArrowLeft', expected: 0.45 },
    { orientation: 'vertical', key: 'ArrowRight', expected: 0.55 },
    { orientation: 'horizontal', key: 'ArrowUp', expected: 0.45 },
    { orientation: 'horizontal', key: 'ArrowDown', expected: 0.55 },
  ] as const)('resizes $orientation using $key', ({ orientation, key, expected }) => {
    const wrapper = mountDivider(orientation)
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    wrapper.element.dispatchEvent(event)
    expect(wrapper.emitted('resize')).toEqual([[expected]])
    expect(event.defaultPrevented).toBe(true)
  })

  test.each([
    { orientation: 'vertical', keys: ['ArrowUp', 'ArrowDown'] },
    { orientation: 'horizontal', keys: ['ArrowLeft', 'ArrowRight'] },
  ] as const)('ignores_keys_for_the_other_axis_in_$orientation', async ({ orientation, keys }) => {
    const wrapper = mountDivider(orientation)
    for (const key of [...keys, 'Enter']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      wrapper.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(wrapper.emitted('resize')).toBeUndefined()
  })

  test('selects_default_limits_with_home_and_end_and_clamps_arrow_changes', async () => {
    const wrapper = mountDivider()
    await wrapper.trigger('keydown', { key: 'Home' })
    await wrapper.trigger('keydown', { key: 'End' })
    await wrapper.setProps({ value: 0.21 })
    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    await wrapper.setProps({ value: 0.79 })
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('resize')).toEqual([[0.2], [0.8], [0.2], [0.8]])
  })

  test('honors_custom_limits_for_keyboard_and_accessible_values', async () => {
    const wrapper = mountDivider('horizontal', { min: 0.3, max: 0.7, value: 0.9 })
    expect(wrapper.attributes('aria-valuemin')).toBe('30')
    expect(wrapper.attributes('aria-valuemax')).toBe('70')
    expect(wrapper.attributes('aria-valuenow')).toBe('70')
    await wrapper.trigger('keydown', { key: 'Home' })
    await wrapper.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('resize')).toEqual([[0.3], [0.7]])
  })

  test.each([
    { orientation: 'vertical', start: [500, 180], move: [580, 300], expected: 0.6 },
    { orientation: 'horizontal', start: [500, 180], move: [580, 220], expected: 0.6 },
  ] as const)('uses_parent_dimensions_and_pointer_deltas_for_$orientation', ({ orientation, start, move, expected }) => {
    const wrapper = mountDivider(orientation)
    pointer(wrapper.element, 'pointerdown', start[0], start[1])
    pointer(window, 'pointermove', move[0], move[1])
    expect(wrapper.emitted('resize')).toEqual([[expected]])
    expect(document.activeElement).toBe(wrapper.element)
    pointer(window, 'pointermove', 5000, 5000)
    pointer(window, 'pointermove', -5000, -5000)
    expect(wrapper.emitted('resize')?.slice(-2)).toEqual([[0.8], [0.2]])
  })

  test.each(['pointerup', 'pointercancel'])('stops_resizing_after_%s', (completion) => {
    const wrapper = mountDivider()
    pointer(wrapper.element, 'pointerdown', 500, 180)
    pointer(window, 'pointermove', 580, 180)
    pointer(window, completion, 580, 180)
    pointer(window, 'pointermove', 660, 180)
    expect(wrapper.emitted('resize')).toEqual([[0.6]])
  })

  test('ignores_other_pointers_and_secondary_buttons', () => {
    const wrapper = mountDivider()
    pointer(wrapper.element, 'pointerdown', 500, 180, 1, 2)
    pointer(window, 'pointermove', 580, 180)
    expect(wrapper.emitted('resize')).toBeUndefined()
    pointer(wrapper.element, 'pointerdown', 500, 180)
    pointer(window, 'pointermove', 580, 180, 2)
    pointer(window, 'pointerup', 580, 180, 2)
    pointer(window, 'pointermove', 580, 180)
    expect(wrapper.emitted('resize')).toEqual([[0.6]])
  })

  test('removes_global_pointer_listeners_when_unmounted_during_a_drag', () => {
    const wrapper = mountDivider()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    pointer(wrapper.element, 'pointerdown', 500, 180)
    const listeners = add.mock.calls.filter(([type]) => type.startsWith('pointer'))
    expect(listeners.map(([type]) => type).sort()).toEqual(['pointercancel', 'pointermove', 'pointerup'])
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    for (const [type, listener] of listeners) expect(remove).toHaveBeenCalledWith(type, listener)
  })
})

describe('split tab controls', () => {
  test('marks_both_participants_and_only_the_focused_document', () => {
    const wrapper = mountTabs()
    const first = wrapper.get('[data-tab-id="first"]')
    const second = wrapper.get('[data-tab-id="second"]')
    const third = wrapper.get('[data-tab-id="third"]')
    expect(first.classes()).toContain('is-split')
    expect(first.classes()).not.toContain('is-active')
    expect(second.classes()).toContain('is-split')
    expect(second.classes()).toContain('is-active')
    expect(third.classes()).not.toContain('is-split')
    expect(first.get('.editor-tab-title').attributes('aria-label')).toBe('Chapter One, shown in split')
    expect(second.get('.editor-tab-title').attributes('aria-label')).toBe('Research Notes, shown in split')
    expect(third.get('.editor-tab-title').attributes('aria-label')).toBe('Chapter Two')
    expect(first.get('.editor-tab-title').attributes('aria-pressed')).toBe('false')
    expect(second.get('.editor-tab-title').attributes('aria-pressed')).toBe('true')
  })

  test('exposes_orientation_pressed_state_and_emits_split_actions', async () => {
    const wrapper = mountTabs()
    const vertical = wrapper.get('[aria-label="Split editor vertically"]')
    const horizontal = wrapper.get('[aria-label="Split editor horizontally"]')
    expect(vertical.attributes('aria-pressed')).toBe('true')
    expect(horizontal.attributes('aria-pressed')).toBe('false')
    await vertical.trigger('click')
    await horizontal.trigger('click')
    expect(wrapper.emitted('split')).toEqual([['vertical'], ['horizontal']])
    await wrapper.setProps({ splitOrientation: 'horizontal' })
    expect(vertical.attributes('aria-pressed')).toBe('false')
    expect(horizontal.attributes('aria-pressed')).toBe('true')
    await wrapper.get('[aria-label="Exit split view"]').trigger('click')
    expect(wrapper.emitted('exitSplit')).toEqual([[]])
  })

  test.each([{ availableTabs: [] }, { availableTabs: [tabs[0]!] }])('disables_split_controls_with_fewer_than_two_tabs_$availableTabs.length', ({ availableTabs }) => {
    const wrapper = mountTabs({ tabs: availableTabs, splitIds: [], splitOrientation: null })
    expect(wrapper.get('[aria-label="Split editor vertically"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="Split editor horizontally"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="Exit split view"]').attributes('disabled')).toBeDefined()
  })

  test('allows_split_but_disables_exit_outside_split_view', async () => {
    const wrapper = mountTabs({ splitIds: [], splitOrientation: null })
    expect(wrapper.get('[aria-label="Split editor vertically"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[aria-label="Split editor vertically"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[aria-label="Split editor horizontally"]').attributes('aria-pressed')).toBe('false')
    await wrapper.get('[aria-label="Exit split view"]').trigger('click')
    expect(wrapper.emitted('exitSplit')).toBeUndefined()
    await wrapper.get('[aria-label="Chapter One"]').trigger('click')
    expect(wrapper.emitted('activate')).toEqual([['first']])
  })

  test('restores_focus_to_a_remaining_title_after_closing_a_tab', async () => {
    const host = defineComponent({
      components: { EditorTabs },
      setup() {
        const openTabs = shallowRef([...tabs])
        const close = (id: string) => { openTabs.value = openTabs.value.filter((tab) => tab.id !== id) }
        return { openTabs, close }
      },
      template: '<EditorTabs :tabs="openTabs" active-id="second" :split-ids="[]" :split-orientation="null" @close="close" />',
    })
    const wrapper = mount(host, { attachTo: document.body, global: { plugins: [[PrimeVue, { unstyled: true }]] } })
    wrappers.push(wrapper)
    const close = wrapper.get<HTMLButtonElement>('[aria-label="Close Research Notes"]')
    close.element.focus()
    await close.trigger('click', { altKey: true })
    expect(wrapper.findComponent(EditorTabs).emitted('close')).toEqual([['second', true]])
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Chapter Two"]').element)
  })

  test('has_accessible_names_for_every_icon_control', async () => {
    const wrapper = mountTabs()
    const result = await axeCore.run(wrapper.element, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })
})
