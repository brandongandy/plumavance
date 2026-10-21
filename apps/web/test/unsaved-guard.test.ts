import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useUnsavedGuard, type UnsavedGuard } from '../src/composables/useUnsavedGuard.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('unsaved changes guard', () => {
  test('checks_only_destroyed_sessions_but_protects_navigation_globally', async () => {
    // Catches an unrelated dirty buffer blocking a safe action or escaping global navigation protection.
    const dirtyIds = ['dirty-one', 'dirty-two']
    const confirm = vi.fn(() => false)
    let guard!: UnsavedGuard
    const Guarded = defineComponent({ setup() {
      guard = useUnsavedGuard((ids = dirtyIds) => ids.some((id) => dirtyIds.includes(id)), confirm)
      return () => h('main', 'Workspace')
    } })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: Guarded }, { path: '/other', component: { template: '<main>Other</main>' } },
    ] })
    await router.push('/')
    const wrapper = mount(RouterView, { global: { plugins: [router] } })
    expect(guard.canDiscard(['clean'])).toBe(true)
    expect(guard.canDiscard([])).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(guard.canDiscard(dirtyIds)).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
    let performed = false
    guard.runGuarded(() => { performed = true }, ['clean'])
    expect(performed).toBe(true)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/')
    expect(confirm).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

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
