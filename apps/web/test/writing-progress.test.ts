import type {
  ProjectDto,
  RecordWordCountEventRequest,
  UpdateWritingSettingsRequest,
  WritingProgressDto,
} from '@pluma/shared'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { wordCountApi } from '../src/api/word-count.js'
import { useWritingProgressStore } from '../src/stores/writing-progress.js'

const projectA = '11111111-1111-4111-8111-111111111111'
const projectB = '22222222-2222-4222-8222-222222222222'
const storageKey = 'pluma.word-count.pending.v1'

function progress(overrides: Partial<WritingProgressDto> = {}): WritingProgressDto {
  return {
    projectWordTarget: 50000,
    dailyWordTarget: 500,
    dailyCountMode: 'additions',
    projectWordCount: 1000,
    localDate: '2026-10-12',
    dailyWordCount: 10,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((fulfill) => { resolve = fulfill })
  return { promise, resolve }
}

function installApi(options: {
  get?: (projectId: string, date: string) => Response | Promise<Response>
  post?: (projectId: string, event: RecordWordCountEventRequest) => Response | Promise<Response>
  patch?: (projectId: string, input: UpdateWritingSettingsRequest) => Response | Promise<Response>
} = {}): { events: Array<{ projectId: string; event: RecordWordCountEventRequest }> } {
  const events: Array<{ projectId: string; event: RecordWordCountEventRequest }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const id = url.pathname.split('/')[3] ?? ''
    if (init?.method === 'GET' && url.pathname.endsWith('/writing-progress')) {
      const date = url.searchParams.get('localDate') ?? ''
      return options.get?.(id, date) ?? jsonResponse(progress({ localDate: date }))
    }
    if (init?.method === 'POST' && url.pathname.endsWith('/word-count-events')) {
      const event = JSON.parse(String(init.body)) as RecordWordCountEventRequest
      events.push({ projectId: id, event: { ...event } })
      return options.post?.(id, event) ?? jsonResponse({ localDate: event.localDate, dailyWordCount: 10 + event.delta })
    }
    if (init?.method === 'PATCH' && url.pathname.endsWith('/writing-settings') && options.patch) {
      return options.patch(id, JSON.parse(String(init.body)))
    }
    throw new Error(`Unexpected request: ${init?.method} ${url.pathname}`)
  }))
  return { events }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 12, 12))
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  useWritingProgressStore().dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('writing progress', () => {
  test('loads local-date settings and resets Edit Mode', async () => {
    // Catches loading UTC dates or retaining Edit Mode between projects.
    vi.setSystemTime(new Date(2026, 9, 12, 23, 30))
    const dates: string[] = []
    installApi({ get: (_id, date) => { dates.push(date); return jsonResponse(progress()) } })
    const store = useWritingProgressStore()
    store.setEditMode(true)
    await store.load(projectA)
    expect(dates).toEqual(['2026-10-12'])
    expect(store.editMode).toBe(false)
    expect(store.localDate).toBe('2026-10-12')
    expect(store.projectWordTarget).toBe(50000)
    expect(store.dailyWordTarget).toBe(500)
    expect(store.dailyCountMode).toBe('additions')
    expect(store.projectWordCount).toBe(1000)
    expect(store.dailyWordCount).toBe(10)
    expect(store.syncState).toBe('synced')
  })

  test('optimistically batches editor deltas and reconciles the server total', async () => {
    // Catches missing immediate optimism, unbatched sends, or missing reconciliation.
    const response = deferredResponse()
    const api = installApi({ post: () => response.promise })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    expect(store.dailyWordCount).toBe(15)
    store.recordEditorDelta(2)
    expect(store.dailyWordCount).toBe(17)
    expect(api.events).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.events).toEqual([{ projectId: projectA, event: {
      eventId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      localDate: '2026-10-12', delta: 7,
    } }])
    expect(store.syncState).toBe('syncing')
    response.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 22 }))
    await flushPromises()
    expect(store.dailyWordCount).toBe(22)
    expect(store.syncState).toBe('synced')
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  test('replays a failed batch after reload with the same UUID', async () => {
    // Catches lost offline activity or retry IDs that would double-record activity.
    const api = installApi({ post: () => jsonResponse({ message: 'Offline' }, 503) })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    await store.flush()
    expect(store.dailyWordCount).toBe(15)
    expect(store.syncState).toBe('failed')
    const original = api.events[0]?.event
    expect(original).toBeDefined()
    expect(localStorage.getItem(storageKey)).toContain(original?.eventId)
    store.dispose()
    store.$dispose()
    setActivePinia(createPinia())
    const retry = deferredResponse()
    const replayApi = installApi({ post: () => retry.promise })
    const recovered = useWritingProgressStore()
    await recovered.load(projectA)
    expect(recovered.dailyWordCount).toBe(15)
    expect(replayApi.events[0]?.event).toEqual(original)
    retry.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 15 }))
    await flushPromises()
    expect(recovered.dailyWordCount).toBe(15)
    expect(recovered.syncState).toBe('synced')
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  test('keeps the in-flight event immutable and accumulates a separate pending batch', async () => {
    // Catches parallel sends, mutations of retry payloads, or dropped edits at acknowledgement.
    const first = deferredResponse()
    const second = deferredResponse()
    const api = installApi({ post: (_id, event) => event.delta === 5 ? first.promise : second.promise })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    const flushing = store.flush()
    store.recordEditorDelta(3)
    store.recordEditorDelta(4)
    expect(store.dailyWordCount).toBe(22)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.events).toHaveLength(1)
    expect(api.events[0]?.event.delta).toBe(5)
    first.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 15 }))
    await flushPromises()
    expect(api.events).toHaveLength(2)
    expect(api.events[1]?.event.delta).toBe(7)
    expect(api.events[1]?.event.eventId).not.toBe(api.events[0]?.event.eventId)
    expect(store.dailyWordCount).toBe(22)
    second.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 22 }))
    await flushing
    expect(store.dailyWordCount).toBe(22)
  })

  test('retries the immutable failed batch before sending later edits', async () => {
    // Catches merging edits into a failed UUID whose delta may already have reached the server.
    let attempts = 0
    let total = 10
    const api = installApi({ post: (_id, event) => {
      attempts += 1
      if (attempts === 1) return jsonResponse({ message: 'Offline' }, 503)
      total += event.delta
      return jsonResponse({ localDate: event.localDate, dailyWordCount: total })
    } })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    await store.flush()
    store.recordEditorDelta(3)
    store.recordEditorDelta(4)
    expect(store.dailyWordCount).toBe(22)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.events.map(({ event }) => event.delta)).toEqual([5, 5, 7])
    expect(api.events[1]?.event).toEqual(api.events[0]?.event)
    expect(api.events[2]?.event.eventId).not.toBe(api.events[0]?.event.eventId)
    expect(store.dailyWordCount).toBe(22)
    expect(store.syncState).toBe('synced')
  })

  test('reconciles a reopened project after an older in-flight batch is acknowledged', async () => {
    // Catches silently losing the optimistic total when the load sequence changes for the same project.
    const response = deferredResponse()
    let total = 10
    installApi({
      get: () => jsonResponse(progress({ dailyWordCount: total })),
      post: () => response.promise,
    })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    const flushing = store.flush()
    await store.load(projectA)
    expect(store.dailyWordCount).toBe(15)
    total = 15
    response.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 15 }))
    await flushing
    await flushPromises()
    expect(store.dailyWordCount).toBe(15)
    expect(store.syncState).toBe('synced')
  })

  test('retains a reopened project acknowledgment when reconciliation fails and reports the failure', async () => {
    // Catches dropping acknowledged words and reporting synced when the replacement read fails.
    const eventResponse = deferredResponse()
    const reconciliation = deferredResponse()
    let reads = 0
    const api = installApi({
      get: () => {
        reads += 1
        if (reads === 3) return reconciliation.promise
        return jsonResponse(progress({ dailyWordCount: reads > 3 ? 15 : 10 }))
      },
      post: () => eventResponse.promise,
    })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    const flushing = store.flush()
    await store.load(projectA)
    expect(store.dailyWordCount).toBe(15)
    eventResponse.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 15 }))
    await flushing
    reconciliation.resolve(jsonResponse({ message: 'Progress unavailable' }, 503))
    await flushPromises()
    expect(store.dailyWordCount).toBe(15)
    expect(store.syncState).toBe('failed')
    expect(store.errorMessage).toBe('Progress unavailable')
    // The event really was acknowledged; retain its baseline rather than replaying it.
    expect(localStorage.getItem(storageKey)).toBeNull()
    await store.flush()
    expect(api.events).toHaveLength(1)
    expect(store.dailyWordCount).toBe(15)
    expect(store.syncState).toBe('failed')
    await store.refresh()
    expect(store.dailyWordCount).toBe(15)
    expect(store.syncState).toBe('synced')
    expect(store.errorMessage).toBe('')
  })

  test('ignores late progress and event responses after switching projects', async () => {
    // Catches either asynchronous response replacing the newly opened project's counts.
    const lateProgress = deferredResponse()
    const lateEvent = deferredResponse()
    installApi({
      get: (id) => id === projectA ? lateProgress.promise : jsonResponse(progress({ projectWordCount: 200, dailyWordCount: 30 })),
    })
    const store = useWritingProgressStore()
    const loadA = store.load(projectA)
    await store.load(projectB)
    lateProgress.resolve(jsonResponse(progress({ projectWordCount: 9000, dailyWordCount: 90 })))
    await loadA
    expect(store.projectId).toBe(projectB)
    expect(store.projectWordCount).toBe(200)
    expect(store.dailyWordCount).toBe(30)
    installApi({
      get: (id) => jsonResponse(progress({ projectWordCount: id === projectA ? 1000 : 200, dailyWordCount: id === projectA ? 10 : 30 })),
      post: () => lateEvent.promise,
    })
    await store.load(projectA)
    store.recordEditorDelta(5)
    const flushing = store.flush()
    await store.load(projectB)
    lateEvent.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 99 }))
    await flushing
    expect(store.projectId).toBe(projectB)
    expect(store.dailyWordCount).toBe(30)
  })

  test('retains the old-date batch at midnight and counts new activity in the new day', async () => {
    // Catches redating old events or showing yesterday's optimistic total after rollover.
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 59, 900))
    const oldDay = deferredResponse()
    const newDay = deferredResponse()
    const api = installApi({
      get: (_id, date) => jsonResponse(progress({ localDate: date, dailyWordCount: date === '2026-10-12' ? 10 : 2 })),
      post: (_id, event) => event.localDate === '2026-10-12' ? oldDay.promise : newDay.promise,
    })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    await vi.advanceTimersByTimeAsync(100)
    expect(store.localDate).toBe('2026-10-13')
    expect(store.dailyWordCount).toBe(2)
    expect(api.events[0]?.event).toMatchObject({ localDate: '2026-10-12', delta: 5 })
    expect(localStorage.getItem(storageKey)).toContain('2026-10-12')
    store.recordEditorDelta(3)
    expect(store.dailyWordCount).toBe(5)
    oldDay.resolve(jsonResponse({ localDate: '2026-10-12', dailyWordCount: 15 }))
    await flushPromises()
    expect(store.dailyWordCount).toBe(5)
    expect(api.events[1]?.event).toMatchObject({ localDate: '2026-10-13', delta: 3 })
    newDay.resolve(jsonResponse({ localDate: '2026-10-13', dailyWordCount: 5 }))
    await flushPromises()
    expect(store.dailyWordCount).toBe(5)
  })

  test('derives live project words from the unsaved difference, including deletions', async () => {
    installApi()
    const store = useWritingProgressStore()
    await store.load(projectA)
    expect(store.liveProjectWordCount(120, 100)).toBe(1020)
    expect(store.liveProjectWordCount(80, 100)).toBe(980)
    store.setEditMode(true)
    expect(store.liveProjectWordCount(120, 100)).toBe(1020)
  })

  test('applies count mode and Edit Mode before queuing activity', async () => {
    // Catches recording additions-only deletions or excluded editing activity.
    const api = installApi()
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(-5)
    store.recordEditorDelta(0)
    store.setEditMode(true)
    store.recordEditorDelta(8)
    await store.flush()
    expect(store.dailyWordCount).toBe(10)
    expect(api.events).toHaveLength(0)
    installApi({ get: () => jsonResponse(progress({ dailyCountMode: 'net' })) })
    await store.load(projectA)
    store.recordEditorDelta(-15)
    expect(store.dailyWordCount).toBe(-5)
    await store.flush()
    expect(store.dailyWordCount).toBe(-5)
  })

  test('refreshes the saved aggregate without resetting Edit Mode', async () => {
    let savedWords = 1000
    installApi({ get: () => jsonResponse(progress({ projectWordCount: savedWords })) })
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.setEditMode(true)
    savedWords = 1020
    await store.refresh()
    expect(store.liveProjectWordCount(120, 120)).toBe(1020)
    expect(store.editMode).toBe(true)
  })

  test('updates validated settings and keeps current counts', async () => {
    installApi()
    const store = useWritingProgressStore()
    await store.load(projectA)
    const input = { projectWordTarget: null, dailyWordTarget: 750, dailyCountMode: 'net' as const }
    const updated: ProjectDto = {
      id: projectA, name: 'Manuscript', createdAt: '', updatedAt: '', lastOpenedAt: '', ...input,
    }
    vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit) => {
      expect(path).toBe(`/api/projects/${projectA}/writing-settings`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(String(init.body))).toEqual(input)
      return jsonResponse(updated)
    }))
    await store.updateSettings(input)
    expect(store.projectWordTarget).toBeNull()
    expect(store.dailyWordTarget).toBe(750)
    expect(store.dailyCountMode).toBe('net')
    expect(store.dailyWordCount).toBe(10)
    expect(store.projectWordCount).toBe(1000)
  })

  test('keeps saved settings when an older refresh resolves and still reconciles its counts', async () => {
    // Catches an older count refresh reverting net mode and dropping subsequent deletions.
    const staleRefresh = deferredResponse()
    let reads = 0
    const api = installApi({
      get: () => ++reads === 1 ? jsonResponse(progress()) : staleRefresh.promise,
      patch: (id, input) => jsonResponse({
        id, name: 'Manuscript', createdAt: '', updatedAt: '', lastOpenedAt: '', ...input,
      }),
    })
    const store = useWritingProgressStore()
    await store.load(projectA)
    const refreshing = store.refresh()
    await store.updateSettings({ projectWordTarget: 60000, dailyWordTarget: 750, dailyCountMode: 'net' })
    staleRefresh.resolve(jsonResponse(progress({ projectWordCount: 1010, dailyWordCount: 20 })))
    await refreshing
    expect(store.dailyCountMode).toBe('net')
    expect(store.projectWordTarget).toBe(60000)
    expect(store.dailyWordTarget).toBe(750)
    expect(store.projectWordCount).toBe(1010)
    expect(store.dailyWordCount).toBe(20)
    store.recordEditorDelta(-5)
    expect(store.dailyWordCount).toBe(15)
    await store.flush()
    expect(api.events[0]?.event.delta).toBe(-5)
  })

  test('rejects malformed progress and event responses', async () => {
    // Catches accepting server responses that cannot satisfy the shared DTO contract.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(progress({ dailyWordCount: 1.5 }))))
    await expect(wordCountApi.getProgress(projectA, '2026-10-12')).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ localDate: '2026-02-30', dailyWordCount: 10 })))
    await expect(wordCountApi.recordEvent(projectA, {
      eventId: '33333333-3333-4333-8333-333333333333', localDate: '2026-10-12', delta: 5,
    })).rejects.toThrow()
  })

  test('rejects valid responses for a different requested day', async () => {
    // Catches applying a structurally valid total to the wrong day's display.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(progress({ localDate: '2026-10-13' }))))
    await expect(wordCountApi.getProgress(projectA, '2026-10-12')).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ localDate: '2026-10-13', dailyWordCount: 15 })))
    await expect(wordCountApi.recordEvent(projectA, {
      eventId: '33333333-3333-4333-8333-333333333333', localDate: '2026-10-12', delta: 5,
    })).rejects.toThrow()
  })

  test('disposes rollover and debounce timers while retaining unacknowledged work', async () => {
    // Catches abandoned timer callbacks issuing requests after workspace disposal.
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 59, 900))
    const api = installApi()
    const store = useWritingProgressStore()
    await store.load(projectA)
    store.recordEditorDelta(5)
    store.dispose()
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.events).toHaveLength(0)
    expect(store.localDate).toBe('2026-10-12')
    expect(localStorage.getItem(storageKey)).toContain('2026-10-12')
  })
})
