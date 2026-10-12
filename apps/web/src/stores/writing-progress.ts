import {
  RecordWordCountEventRequestSchema,
  type DailyCountMode,
  type UpdateWritingSettingsRequest,
} from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { z } from 'zod'

import { wordCountApi } from '../api/word-count.js'
import {
  dailyDelta,
  localDateKey,
  millisecondsUntilNextLocalMidnight,
} from '../features/word-count/activity.js'

const storageKey = 'pluma.word-count.pending.v1'
const BatchSchema = RecordWordCountEventRequestSchema.extend({ projectId: z.string() })
const QueueSchema = z.object({ inFlight: BatchSchema.nullable(), pending: z.array(BatchSchema) })
type Batch = Readonly<z.infer<typeof BatchSchema>>

function readQueue(): z.infer<typeof QueueSchema> {
  try {
    const value = localStorage.getItem(storageKey)
    if (value) {
      const parsed = QueueSchema.safeParse(JSON.parse(value))
      if (parsed.success) return parsed.data
    }
  } catch { /* Storage may be unavailable; activity can still sync from memory. */ }
  return { inFlight: null, pending: [] }
}

export const useWritingProgressStore = defineStore('writing-progress', () => {
  const restored = readQueue()
  const projectId = shallowRef<string | null>(null)
  const localDate = shallowRef('')
  const projectWordTarget = shallowRef<number | null>(null)
  const dailyWordTarget = shallowRef<number | null>(null)
  const dailyCountMode = shallowRef<DailyCountMode>('additions')
  const projectWordCount = shallowRef(0)
  const editMode = shallowRef(false)
  const loading = shallowRef(false)
  const errorMessage = shallowRef('')
  const _serverDailyWordCount = shallowRef(0)
  const _inFlight = shallowRef<Batch | null>(restored.inFlight && Object.freeze(restored.inFlight))
  const _pending = shallowRef<Batch[]>(restored.pending)
  const _syncFailed = shallowRef(false)
  let loadSequence = 0
  let readSequence = 0
  let dailyRevision = 0
  let disposed = false
  let midnightTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let sending: Promise<void> | undefined

  const dailyWordCount = computed(() => {
    const batches = _inFlight.value ? [_inFlight.value, ..._pending.value] : _pending.value
    return _serverDailyWordCount.value + batches.reduce((total, batch) =>
      total + (batch.projectId === projectId.value && batch.localDate === localDate.value ? batch.delta : 0), 0)
  })
  const syncState = computed<'synced' | 'syncing' | 'failed'>(() => {
    if (_syncFailed.value) return 'failed'
    return _inFlight.value || _pending.value.length ? 'syncing' : 'synced'
  })

  function persistQueue(): void {
    try {
      if (!_inFlight.value && !_pending.value.length) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, JSON.stringify({ inFlight: _inFlight.value, pending: _pending.value }))
    } catch {
      errorMessage.value = 'Writing activity could not be saved locally.'
    }
  }

  function isCurrent(id: string, sequence: number): boolean {
    return !disposed && projectId.value === id && loadSequence === sequence
  }

  function scheduleMidnight(): void {
    clearTimeout(midnightTimer)
    if (disposed || !projectId.value) return
    midnightTimer = setTimeout(() => { rollover() }, millisecondsUntilNextLocalMidnight(new Date()))
  }

  function rollover(): void {
    const today = localDateKey(new Date())
    if (disposed || !projectId.value || today === localDate.value) return
    void flush()
    localDate.value = today
    _serverDailyWordCount.value = 0
    void readProgress()
    scheduleMidnight()
  }

  async function readProgress(): Promise<void> {
    const id = projectId.value
    if (!id || disposed) return
    const sequence = loadSequence
    const requestSequence = ++readSequence
    const date = localDate.value
    const revision = dailyRevision
    loading.value = true
    errorMessage.value = ''
    try {
      const progress = await wordCountApi.getProgress(id, date)
      if (!isCurrent(id, sequence) || readSequence !== requestSequence || localDate.value !== date) return
      projectWordTarget.value = progress.projectWordTarget
      dailyWordTarget.value = progress.dailyWordTarget
      dailyCountMode.value = progress.dailyCountMode
      projectWordCount.value = progress.projectWordCount
      // A newer event acknowledgement already supplies the authoritative daily total.
      if (revision === dailyRevision) _serverDailyWordCount.value = progress.dailyWordCount
    } catch (error) {
      if (isCurrent(id, sequence) && readSequence === requestSequence) {
        errorMessage.value = error instanceof Error ? error.message : 'Writing progress could not be loaded.'
      }
    } finally {
      if (isCurrent(id, sequence) && readSequence === requestSequence) loading.value = false
    }
  }

  async function load(id: string): Promise<void> {
    clearTimeout(midnightTimer)
    clearTimeout(debounceTimer)
    disposed = false
    loadSequence += 1
    const sequence = loadSequence
    projectId.value = id
    localDate.value = localDateKey(new Date())
    editMode.value = false
    projectWordTarget.value = null
    dailyWordTarget.value = null
    dailyCountMode.value = 'additions'
    projectWordCount.value = 0
    _serverDailyWordCount.value = 0
    scheduleMidnight()
    await readProgress()
    if (isCurrent(id, sequence)) void flush()
  }

  async function refresh(): Promise<void> {
    rollover()
    await readProgress()
  }

  function recordEditorDelta(delta: number): void {
    if (!projectId.value || disposed) return
    rollover()
    const activity = dailyDelta(delta, dailyCountMode.value, editMode.value)
    if (!activity) return
    const index = _pending.value.findIndex((batch) =>
      batch.projectId === projectId.value && batch.localDate === localDate.value)
    if (index === -1) {
      _pending.value = [..._pending.value, {
        projectId: projectId.value,
        eventId: crypto.randomUUID(),
        localDate: localDate.value,
        delta: activity,
      }]
    } else {
      _pending.value = _pending.value.map((batch, position) =>
        position === index ? { ...batch, delta: batch.delta + activity } : batch)
        .filter((batch) => batch.delta !== 0)
    }
    persistQueue()
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void flush() }, 500)
  }

  async function sendBatches(): Promise<void> {
    _syncFailed.value = false
    while (!disposed && (_inFlight.value || _pending.value.length)) {
      if (!_inFlight.value) {
        _inFlight.value = Object.freeze(_pending.value[0]!)
        _pending.value = _pending.value.slice(1)
        persistQueue()
      }
      const batch = _inFlight.value
      const sequence = loadSequence
      try {
        const result = await wordCountApi.recordEvent(batch.projectId, {
          eventId: batch.eventId, localDate: batch.localDate, delta: batch.delta,
        })
        if (disposed) return
        _inFlight.value = null
        if (isCurrent(batch.projectId, sequence) && localDate.value === batch.localDate) {
          _serverDailyWordCount.value = result.dailyWordCount
          dailyRevision += 1
        } else if (projectId.value === batch.projectId && localDate.value === batch.localDate) {
          // Reopening the same project invalidates this response; reconcile through a fresh read.
          void readProgress()
        }
        persistQueue()
      } catch (error) {
        if (disposed) return
        _syncFailed.value = true
        if (isCurrent(batch.projectId, sequence)) {
          errorMessage.value = error instanceof Error ? error.message : 'Writing activity could not be synced.'
        }
        return
      }
    }
  }

  function flush(): Promise<void> {
    clearTimeout(debounceTimer)
    if (disposed) return Promise.resolve()
    if (!sending) {
      sending = sendBatches().finally(() => { sending = undefined })
    }
    return sending
  }

  async function updateSettings(input: UpdateWritingSettingsRequest): Promise<void> {
    const id = projectId.value
    const sequence = loadSequence
    if (!id || disposed) return
    const project = await wordCountApi.updateSettings(id, input)
    if (!isCurrent(id, sequence)) return
    projectWordTarget.value = project.projectWordTarget
    dailyWordTarget.value = project.dailyWordTarget
    dailyCountMode.value = project.dailyCountMode
  }

  function setEditMode(enabled: boolean): void {
    editMode.value = enabled
  }

  function liveProjectWordCount(currentWords: number, savedWords: number): number {
    return projectWordCount.value + currentWords - savedWords
  }

  function dispose(): void {
    disposed = true
    loadSequence += 1
    clearTimeout(midnightTimer)
    clearTimeout(debounceTimer)
  }

  return {
    projectId, localDate, projectWordTarget, dailyWordTarget, dailyCountMode,
    projectWordCount, dailyWordCount, editMode, loading, errorMessage, syncState,
    _serverDailyWordCount, _inFlight, _pending, _syncFailed,
    load, refresh, recordEditorDelta, flush, updateSettings, setEditMode, liveProjectWordCount, dispose,
  }
})
