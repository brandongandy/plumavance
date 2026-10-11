import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useUnsavedGuard } from '../src/composables/useUnsavedGuard.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('unsaved changes guard', () => {
  test('protects_route_and_action_transitions_and_registers_beforeunload', async () => {
    const dirty = ref(true)
    const action = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)

    const Guarded = defineComponent({
      setup() {
        const guard = useUnsavedGuard(() => dirty.value)
        return () =>
          h('main', [
            h('button', { onClick: () => guard.runGuarded(action) }, 'Compile'),
            h('button', { onClick: () => guard.runGuarded(action) }, 'Snapshot'),
          ])
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: Guarded },
        { path: '/other', component: { template: '<main>Other</main>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router] } })

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await wrapper.get('button').trigger('click')
    expect(action).not.toHaveBeenCalled()
    await router.push('/other')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(confirm).toHaveBeenCalled()

    dirty.value = false
    await wrapper.get('button').trigger('click')
    expect(action).toHaveBeenCalledTimes(1)
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })
})
