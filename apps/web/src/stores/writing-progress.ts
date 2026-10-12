import {
  type DailyCountMode,
  type ProjectDto,
  type UpdateWritingSettingsRequest,
} from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { ApiRequestError } from '../api/client.js'
import { wordCountApi } from '../api/word-count.js'
import { eventUuid, outboxChangedKey, updateOutbox, type Batch, type Outbox } from '../features/word-count/outbox.js'
import {
  dailyDelta,
  localDateKey,
  millisecondsUntilNextLocalMidnight,
} from '../features/word-count/activity.js'

export const useWritingProgressStore = defineStore('writing-progress', () => {
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
  const _inFlight = shallowRef<Batch | null>(null)
  const _pending = shallowRef<Batch[]>([])
  const localEdits = shallowRef<Batch[]>([])
  const includedInRead = shallowRef<string | null>(null)
  const _syncFailed = shallowRef(false)
  const _progressFailed = shallowRef(false)
  let loadSequence = 0
  let readSequence = 0
  let dailyRevision = 0
  let settingsRevision = 0
  let projectRevision = 0
  let disposed = false
  let midnightTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let sending: Promise<void> | undefined
  let persisting = Promise.resolve()

  const dailyWordCount = computed(() => {
    const batches = [...(_inFlight.value && includedInRead.value !== _inFlight.value.eventId ? [_inFlight.value] : []), ..._pending.value, ...localEdits.value]
    return _serverDailyWordCount.value + batches.reduce((total, batch) =>
      total + (batch.projectId === projectId.value && batch.localDate === localDate.value ? batch.delta : 0), 0)
  })
  const syncState = computed<'synced' | 'syncing' | 'failed'>(() => {
    if (_syncFailed.value || _progressFailed.value) return 'failed'
    return _inFlight.value || _pending.value.length || localEdits.value.length ? 'syncing' : 'synced'
  })

  function applyQueue(queue: Outbox): void {
    _inFlight.value = queue.inFlight && Object.freeze(queue.inFlight)
    _pending.value = queue.pending
  }

  function notifyTabs(): void {
    try { localStorage.setItem(outboxChangedKey, eventUuid()) } catch { /* The outbox remains durable. */ }
  }

  async function syncQueue(): Promise<void> {
    await persisting
    applyQueue(await updateOutbox())
  }

  function storageChanged(event: StorageEvent): void {
    if (disposed || event.key !== outboxChangedKey) return
    void syncQueue().then(() => readProgress()).catch(() => {
      _syncFailed.value = true
      errorMessage.value = 'Writing activity could not be saved locally.'
    })
  }
  window.addEventListener('storage', storageChanged)

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
    const loadedSettingsRevision = settingsRevision
    const loadedProjectRevision = projectRevision
    loading.value = true
    errorMessage.value = ''
    try {
      const progress = await wordCountApi.getProgress(id, date)
      await syncQueue()
      if (!isCurrent(id, sequence) || readSequence !== requestSequence || localDate.value !== date) return
      if (loadedSettingsRevision === settingsRevision) {
        projectWordTarget.value = progress.projectWordTarget
        dailyWordTarget.value = progress.dailyWordTarget
        dailyCountMode.value = progress.dailyCountMode
      }
      if (loadedProjectRevision === projectRevision) projectWordCount.value = progress.projectWordCount
      // A newer event acknowledgement already supplies the authoritative daily total.
      if (revision === dailyRevision) {
        const outstanding = _inFlight.value
        if (outstanding?.projectId === id && outstanding.localDate === date) {
          // Replay owns daily reconciliation until acknowledgment. A later GET
          // can already include this UUID, so retain its pre-send baseline.
          _serverDailyWordCount.value = outstanding.baselineDailyWordCount ?? progress.dailyWordCount
          includedInRead.value = outstanding.baselineDailyWordCount === undefined ? outstanding.eventId : null
        } else {
          _serverDailyWordCount.value = progress.dailyWordCount
          includedInRead.value = null
        }
      }
      _progressFailed.value = false
    } catch (error) {
      if (isCurrent(id, sequence) && readSequence === requestSequence) {
        _progressFailed.value = true
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
    window.removeEventListener('storage', storageChanged)
    window.addEventListener('storage', storageChanged)
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
    includedInRead.value = null
    _progressFailed.value = false
    scheduleMidnight()
    try { await syncQueue() } catch {
      _syncFailed.value = true
      errorMessage.value = 'Writing activity could not be saved locally.'
    }
    if (!isCurrent(id, sequence)) return
    const outstanding = _inFlight.value
    if (outstanding?.projectId === id && outstanding.localDate === localDate.value && outstanding.baselineDailyWordCount !== undefined) {
      _serverDailyWordCount.value = outstanding.baselineDailyWordCount
    }
    await readProgress()
    if (isCurrent(id, sequence) && (_inFlight.value || _pending.value.length)) void flush()
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
    const edit: Batch = { projectId: projectId.value, eventId: eventUuid(), localDate: localDate.value, delta: activity }
    localEdits.value = [...localEdits.value, edit]
    persisting = persisting.then(async () => {
      const queue = await updateOutbox((queue) => {
        const existing = queue.pending.findIndex((batch) => batch.projectId === edit.projectId && batch.localDate === edit.localDate)
        if (existing < 0) queue.pending.push(edit)
        else queue.pending[existing] = { ...queue.pending[existing]!, delta: queue.pending[existing]!.delta + edit.delta }
        queue.pending = queue.pending.filter((batch) => batch.delta !== 0)
      })
      applyQueue(queue)
      localEdits.value = localEdits.value.filter((batch) => batch.eventId !== edit.eventId)
      notifyTabs()
    }).catch(() => {
      _syncFailed.value = true
      errorMessage.value = 'Writing activity could not be saved locally.'
    })
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void flush() }, 500)
  }

  function freezeNext(): Promise<Outbox> {
    const id = projectId.value
    const date = localDate.value
    const baseline = _serverDailyWordCount.value
    const frozen = persisting.then(() => updateOutbox((queue) => {
      if (!queue.inFlight && queue.pending.length) {
        const next = queue.pending.shift()!
        queue.inFlight = { ...next, ...(next.projectId === id && next.localDate === date
          ? { baselineDailyWordCount: baseline } : {}) }
      }
    }))
    persisting = frozen.then(applyQueue).catch(() => {
      _syncFailed.value = true
      errorMessage.value = 'Writing activity could not be saved locally.'
    })
    return frozen
  }

  async function sendBatches(): Promise<void> {
    _syncFailed.value = false
    let sequence = loadSequence
    let next = freezeNext()
    while (!disposed) {
      const queue = await next
      const batch = queue.inFlight
      if (!batch || disposed) return
      notifyTabs()
      try {
        const result = await wordCountApi.recordEvent(batch.projectId, {
          eventId: batch.eventId, localDate: batch.localDate, delta: batch.delta,
        })
        if (disposed) return
        await persisting
        let acknowledged = false
        applyQueue(await updateOutbox((queue) => {
          if (queue.inFlight?.eventId === batch.eventId) {
            queue.inFlight = null
            acknowledged = true
          }
        }))
        if (acknowledged) notifyTabs()
        if (projectId.value === batch.projectId && localDate.value === batch.localDate) {
          if (acknowledged) {
            _serverDailyWordCount.value = _inFlight.value?.baselineDailyWordCount ?? result.dailyWordCount
            includedInRead.value = null
            dailyRevision += 1
          }
          // Another tab may have acknowledged this UUID and later batches already.
          if (!acknowledged || loadSequence !== sequence) void readProgress()
        }
        sequence = loadSequence
        next = freezeNext()
      } catch (error) {
        if (disposed) return
        if (error instanceof ApiRequestError && error.status === 404 && error.code === 'PROJECT_NOT_FOUND') {
          applyQueue(await updateOutbox((queue) => {
            if (queue.inFlight?.projectId === batch.projectId) queue.inFlight = null
            queue.pending = queue.pending.filter((event) => event.projectId !== batch.projectId)
          }))
          notifyTabs()
          sequence = loadSequence
          next = freezeNext()
          continue
        }
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
      sending = sendBatches().catch(() => {
        _syncFailed.value = true
        errorMessage.value = 'Writing activity could not be saved locally.'
      }).finally(() => { sending = undefined })
    }
    return sending
  }

  async function updateSettings(input: UpdateWritingSettingsRequest): Promise<void> {
    const id = projectId.value
    const sequence = loadSequence
    if (!id || disposed) return
    const project = await wordCountApi.updateSettings(id, input)
    if (!isCurrent(id, sequence)) return
    settingsRevision += 1
    projectWordTarget.value = project.projectWordTarget
    dailyWordTarget.value = project.dailyWordTarget
    dailyCountMode.value = project.dailyCountMode
  }

  function setEditMode(enabled: boolean): void {
    editMode.value = enabled
  }

  function seedSettings(project: ProjectDto): void {
    if (projectId.value !== project.id || disposed) return
    settingsRevision += 1
    projectWordTarget.value = project.projectWordTarget
    dailyWordTarget.value = project.dailyWordTarget
    dailyCountMode.value = project.dailyCountMode
  }

  function liveProjectWordCount(currentWords: number, savedWords: number): number {
    return projectWordCount.value + currentWords - savedWords
  }

  function accountSavedBody(id: string, previousWords: number, savedWords: number): void {
    if (projectId.value !== id || disposed) return
    projectRevision += 1
    projectWordCount.value += savedWords - previousWords
    void readProgress()
  }

  function dispose(): void {
    disposed = true
    loadSequence += 1
    clearTimeout(midnightTimer)
    clearTimeout(debounceTimer)
    window.removeEventListener('storage', storageChanged)
  }

  return {
    projectId, localDate, projectWordTarget, dailyWordTarget, dailyCountMode,
    projectWordCount, dailyWordCount, editMode, loading, errorMessage, syncState,
    _serverDailyWordCount, _inFlight, _pending, _syncFailed, _progressFailed,
    load, refresh, recordEditorDelta, flush, updateSettings, seedSettings, setEditMode, liveProjectWordCount, accountSavedBody, dispose,
  }
})
