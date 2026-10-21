import type { BinderItemDto } from '@pluma/shared'
import PrimeVue from 'primevue/config'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { UnsavedGuardKey } from '../src/composables/useUnsavedGuard.js'
import BinderTree from '../src/features/binder/BinderTree.vue'
import { useWorkspaceStore } from '../src/stores/workspace.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-10-10T00:00:00.000Z'
const item: BinderItemDto = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  parentId: null,
  kind: 'document',
  title: 'Lantern',
  position: 0,
  trashedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
}

function mountTree() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkspaceStore()
  store.$patch({ projectId, items: [item], activeItemId: item.id })
  const wrapper = mount(BinderTree, {
    global: {
      plugins: [pinia, [PrimeVue, { unstyled: true }]],
      provide: {
        [UnsavedGuardKey as symbol]: {
          canDiscard: () => true,
          runGuarded: (action: () => unknown) => action(),
        },
      },
    },
  })
  return { store, wrapper }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('binder search scheduling', () => {
  test('rapid_changes_produce_one_request_after_250ms', async () => {
    vi.useFakeTimers()
    const { store, wrapper } = mountTree()
    const search = vi.spyOn(store, 'search').mockResolvedValue()
    const input = wrapper.get('input[aria-label="Search binder"]')

    await input.setValue('lan')
    await input.setValue('lantern')
    expect(search).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(249)
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('lantern', expect.any(AbortSignal))
  })

  test('a_new_query_aborts_in_flight_work_and_clearing_resets_immediately', async () => {
    vi.useFakeTimers()
    const { store, wrapper } = mountTree()
    const signals: AbortSignal[] = []
    const search = vi.spyOn(store, 'search').mockImplementation(async (_query, signal) => {
      if (signal) signals.push(signal)
    })
    const input = wrapper.get('input[aria-label="Search binder"]')

    await input.setValue('first')
    await vi.advanceTimersByTimeAsync(250)
    expect(signals[0]?.aborted).toBe(false)

    await input.setValue('second')
    expect(signals[0]?.aborted).toBe(true)
    await input.setValue('')

    expect(search).toHaveBeenLastCalledWith('', expect.any(AbortSignal))
    expect(store.searchResults).toEqual([])
  })
})
