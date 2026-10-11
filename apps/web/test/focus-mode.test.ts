import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, expect, test, vi } from 'vitest'

import { useFocusMode } from '../src/features/focus/useFocusMode.js'

afterEach(() => vi.restoreAllMocks())

test('uses_browser_fullscreen_and_exits_on_escape_with_cleanup', async () => {
  const requestFullscreen = vi.fn(async () => undefined)
  const exitFullscreen = vi.fn(async () => undefined)
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
  const Harness = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      const focus = useFocusMode(root)
      return () => h('div', { ref: root, class: { active: focus.isActive.value }, onClick: focus.enter })
    },
  })
  const wrapper = mount(Harness)
  Object.defineProperty(wrapper.element, 'requestFullscreen', { configurable: true, value: requestFullscreen })
  await wrapper.trigger('click')
  expect(requestFullscreen).toHaveBeenCalled()
  expect(wrapper.classes()).toContain('active')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await nextTick()
  expect(wrapper.classes()).not.toContain('active')
  wrapper.unmount()
})

test('keeps_an_in_app_fallback_when_fullscreen_is_denied', async () => {
  const root = ref(document.createElement('div'))
  Object.defineProperty(root.value, 'requestFullscreen', { configurable: true, value: vi.fn(async () => { throw new Error('Denied') }) })
  const Harness = defineComponent({ setup: () => { const focus = useFocusMode(root); return () => h('button', { onClick: focus.enter }, String(focus.isActive.value)) } })
  const wrapper = mount(Harness)
  await wrapper.trigger('click')
  expect(wrapper.text()).toBe('true')
})
