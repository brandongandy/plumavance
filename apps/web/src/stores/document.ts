import type {
  DocumentDto,
  EditorDocument,
  SaveDocumentRequest,
  SnapshotDto,
  SnapshotSummaryDto,
} from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'

import { ApiRequestError } from '../api/client.js'
import { documentApi } from '../api/documents.js'
import { snapshotApi } from '../api/snapshots.js'
import { countText, editorText } from '../features/editor/counts.js'
import { useWritingProgressStore } from './writing-progress.js'

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed' | 'conflict'

interface ConflictMetadata {
  currentRevision: number
  savedAt: string
}

interface SavedBuffer {
  title: string
  contentJson: EditorDocument
  notesText: string
}

export interface DocumentSession {
  documentId: string
  title: string
  contentJson: EditorDocument
  notesText: string
  revision: number
  savedAt: string
  savedBuffer: SavedBuffer | null
  operation: 'idle' | 'saving' | 'failed' | 'conflict'
  conflict: ConflictMetadata | null
  errorMessage: string
  loading: boolean
  snapshots: SnapshotSummaryDto[]
  scrollTop: number
  readonly isDirty: boolean
  readonly contentText: string
  readonly counts: { words: number; characters: number }
  readonly savedWordCount: number
  readonly saveState: SaveState
}

interface SessionRequests {
  generation: number
  write: number
  snapshotList: number
  snapshotDetail: number
  snapshotMutations: Map<string, number>
}

function bufferOf(document: DocumentDto): SavedBuffer {
  return { title: document.title, contentJson: document.contentJson, notesText: document.notesText }
}

function sameContent(left: EditorDocument, right: EditorDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createSession(id: string): DocumentSession {
  const session: DocumentSession = reactive({
    documentId: id,
    title: '',
    contentJson: { type: 'doc', content: [{ type: 'paragraph' }] } as EditorDocument,
    notesText: '',
    revision: 0,
    savedAt: '',
    savedBuffer: null as SavedBuffer | null,
    operation: 'idle' as DocumentSession['operation'],
    conflict: null as ConflictMetadata | null,
    errorMessage: '',
    loading: false,
    snapshots: [] as SnapshotSummaryDto[],
    scrollTop: 0,
    isDirty: computed(() => {
      const saved = session.savedBuffer
      return saved !== null && (
        session.title !== saved.title || session.notesText !== saved.notesText ||
        !sameContent(session.contentJson, saved.contentJson)
      )
    }),
    contentText: computed(() => editorText(session.contentJson)),
    counts: computed(() => countText(session.contentText)),
    savedWordCount: computed(() => session.savedBuffer
      ? countText(editorText(session.savedBuffer.contentJson)).words : 0),
    saveState: computed<SaveState>(() => session.operation !== 'idle'
      ? session.operation : session.isDirty ? 'unsaved' : 'saved'),
  })
  return session
}

export const useDocumentStore = defineStore('document', () => {
  const sessions = reactive(new Map<string, DocumentSession>())
  const requests = new WeakMap<DocumentSession, SessionRequests>()

  function sessionFor(id: string): DocumentSession | undefined {
    return sessions.get(id)
  }

  function ensureSession(id: string): DocumentSession {
    let session = sessionFor(id)
    if (!session) {
      session = createSession(id)
      sessions.set(id, session)
      requests.set(session, {
        generation: 0, write: 0, snapshotList: 0, snapshotDetail: 0,
        snapshotMutations: new Map(),
      })
    }
    return session
  }

  function isCurrent(session: DocumentSession, generation: number): boolean {
    return sessionFor(session.documentId) === session && requests.get(session)?.generation === generation
  }

  function applyServerDocument(session: DocumentSession, document: DocumentDto, replaceBuffer = true): void {
    if (replaceBuffer) {
      session.title = document.title
      session.contentJson = document.contentJson
      session.notesText = document.notesText
    }
    session.revision = document.revision
    session.savedAt = document.savedAt
    session.savedBuffer = bufferOf(document)
    session.operation = 'idle'
    session.conflict = null
    session.errorMessage = ''
  }

  async function load(id: string, force = false): Promise<boolean> {
    const session = ensureSession(id)
    if (!force && session.savedBuffer) return true
    const state = requests.get(session)!
    const generation = ++state.generation
    session.loading = true
    session.errorMessage = ''
    session.operation = 'idle'
    session.snapshots = []
    try {
      const document = await documentApi.get(id)
      if (!isCurrent(session, generation) || document.id !== id) return false
      applyServerDocument(session, document)
      void loadSnapshots(id)
      return true
    } catch (error) {
      if (isCurrent(session, generation)) {
        session.operation = 'failed'
        session.errorMessage = error instanceof Error ? error.message : 'The document could not be loaded.'
      }
      return false
    } finally {
      if (isCurrent(session, generation)) session.loading = false
    }
  }

  function discard(id: string): void {
    const session = sessionFor(id)
    if (session) requests.get(session)!.generation += 1
    sessions.delete(id)
  }

  function clear(): void {
    for (const id of sessions.keys()) discard(id)
  }

  function dirtyDocumentIds(ids: readonly string[] = [...sessions.keys()]): string[] {
    return ids.filter((id) => sessionFor(id)?.isDirty)
  }

  function hasDirtySessions(ids?: readonly string[]): boolean {
    return dirtyDocumentIds(ids).length > 0
  }

  async function loadSnapshots(id: string): Promise<void> {
    const session = sessionFor(id)
    if (!session) return
    const state = requests.get(session)!
    const generation = state.generation
    const sequence = ++state.snapshotList
    try {
      const loaded = await snapshotApi.list(id)
      if (isCurrent(session, generation) && state.snapshotList === sequence) {
        session.snapshots = loaded.filter((snapshot) => snapshot.documentId === id)
      }
    } catch (error) {
      if (isCurrent(session, generation) && state.snapshotList === sequence) {
        session.errorMessage = error instanceof Error ? error.message : 'Snapshots could not be loaded.'
      }
    }
  }

  function ownsSnapshot(session: DocumentSession, snapshotId: string): boolean {
    return session.snapshots.some((snapshot) => snapshot.id === snapshotId && snapshot.documentId === session.documentId)
  }

  function snapshotMutation(session: DocumentSession, key: string): () => boolean {
    const state = requests.get(session)!
    const generation = state.generation
    const sequence = (state.snapshotMutations.get(key) ?? 0) + 1
    state.snapshotMutations.set(key, sequence)
    state.snapshotList += 1
    return () => isCurrent(session, generation) && state.snapshotMutations.get(key) === sequence
  }

  async function takeSnapshot(id: string, name: string): Promise<boolean> {
    const session = sessionFor(id)
    if (!session || session.isDirty || session.loading || session.operation === 'saving') return false
    const current = snapshotMutation(session, 'create')
    const trimmed = name.trim()
    const snapshot = await snapshotApi.create(id, trimmed || undefined)
    if (!current() || snapshot.documentId !== id) return false
    requests.get(session)!.snapshotList += 1
    session.snapshots = [snapshot, ...session.snapshots]
    return true
  }

  async function renameSnapshot(id: string, snapshotId: string, name: string): Promise<void> {
    const session = sessionFor(id)
    if (!session || !ownsSnapshot(session, snapshotId)) return
    const current = snapshotMutation(session, snapshotId)
    const renamed = await snapshotApi.rename(snapshotId, name.trim())
    if (!current() || renamed.documentId !== id) return
    requests.get(session)!.snapshotList += 1
    session.snapshots = session.snapshots.map((snapshot) => snapshot.id === renamed.id ? renamed : snapshot)
  }

  async function loadSnapshotDetail(id: string, snapshotId: string): Promise<SnapshotDto | undefined> {
    const session = sessionFor(id)
    if (!session || !ownsSnapshot(session, snapshotId)) return undefined
    const state = requests.get(session)!
    const generation = state.generation
    const sequence = ++state.snapshotDetail
    try {
      const snapshot = await snapshotApi.get(snapshotId)
      if (!isCurrent(session, generation) || sequence !== state.snapshotDetail || snapshot.documentId !== id) return undefined
      return snapshot
    } catch (error) {
      if (isCurrent(session, generation) && sequence === state.snapshotDetail) {
        session.errorMessage = error instanceof Error ? error.message : 'The snapshot could not be loaded.'
      }
      return undefined
    }
  }

  async function restoreSnapshot(id: string, snapshotId: string): Promise<boolean> {
    const session = sessionFor(id)
    if (!session || session.isDirty || session.loading || session.operation === 'saving' || !ownsSnapshot(session, snapshotId)) return false
    const state = requests.get(session)!
    const generation = state.generation
    const sequence = ++state.write
    session.operation = 'saving'
    try {
      const restored = await snapshotApi.restore(snapshotId, session.revision)
      if (!isCurrent(session, generation) || state.write !== sequence || restored.id !== id) return false
      useWritingProgressStore().accountSavedBody(restored.projectId, session.savedWordCount, countText(editorText(restored.contentJson)).words)
      applyServerDocument(session, restored, !session.isDirty)
      return true
    } catch (error) {
      if (isCurrent(session, generation) && state.write === sequence) {
        session.operation = 'failed'
        session.errorMessage = error instanceof Error ? error.message : 'The snapshot could not be restored.'
      }
      return false
    }
  }

  async function deleteSnapshot(id: string, snapshotId: string): Promise<void> {
    const session = sessionFor(id)
    if (!session || !ownsSnapshot(session, snapshotId)) return
    const current = snapshotMutation(session, snapshotId)
    await snapshotApi.delete(snapshotId)
    if (!current()) return
    requests.get(session)!.snapshotList += 1
    session.snapshots = session.snapshots.filter((snapshot) => snapshot.id !== snapshotId)
  }

  function setTitle(id: string, value: string): void {
    const session = sessionFor(id)
    if (!session) return
    session.title = value
    if (session.operation === 'failed') session.operation = 'idle'
  }

  function setContent(id: string, value: EditorDocument): void {
    const session = sessionFor(id)
    if (!session) return
    session.contentJson = value
    if (session.operation === 'failed') session.operation = 'idle'
  }

  function setNotes(id: string, value: string): void {
    const session = sessionFor(id)
    if (!session) return
    session.notesText = value
    if (session.operation === 'failed') session.operation = 'idle'
  }

  function setScrollTop(id: string, value: number): void {
    const session = sessionFor(id)
    if (session) session.scrollTop = value
  }

  async function save(id: string): Promise<boolean> {
    const session = sessionFor(id)
    if (!session || session.loading || !session.savedBuffer || session.operation === 'saving') return false
    if (!session.title.trim()) {
      session.operation = 'failed'
      session.errorMessage = 'Document title cannot be blank.'
      return false
    }
    const state = requests.get(session)!
    const generation = state.generation
    const sequence = ++state.write
    const payload: SaveDocumentRequest = {
      title: session.title.trim(), contentJson: session.contentJson,
      notesText: session.notesText, expectedRevision: session.revision,
    }
    session.operation = 'saving'
    session.errorMessage = ''
    session.conflict = null
    try {
      const saved = await documentApi.save(id, payload)
      if (!isCurrent(session, generation) || state.write !== sequence || saved.id !== id) return false
      useWritingProgressStore().accountSavedBody(saved.projectId, session.savedWordCount, countText(editorText(saved.contentJson)).words)
      session.revision = saved.revision
      session.savedAt = saved.savedAt
      session.savedBuffer = bufferOf(saved)
      const bufferStillMatchesRequest = session.title.trim() === payload.title &&
        session.notesText === payload.notesText && sameContent(session.contentJson, payload.contentJson)
      if (bufferStillMatchesRequest) {
        session.title = saved.title
        session.contentJson = saved.contentJson
        session.notesText = saved.notesText
      }
      session.operation = 'idle'
      return true
    } catch (error) {
      if (!isCurrent(session, generation) || state.write !== sequence) return false
      if (error instanceof ApiRequestError && error.status === 409 && error.code === 'DOCUMENT_CONFLICT') {
        const details = error.details as Partial<ConflictMetadata> | undefined
        session.conflict = {
          currentRevision: details?.currentRevision ?? session.revision,
          savedAt: details?.savedAt ?? session.savedAt,
        }
        session.operation = 'conflict'
      } else {
        session.operation = 'failed'
      }
      session.errorMessage = error instanceof Error ? error.message : 'The document could not be saved.'
      return false
    }
  }

  async function reloadServerCopy(id: string): Promise<boolean> {
    return sessionFor(id) ? load(id, true) : false
  }

  async function keepMine(id: string): Promise<boolean> {
    const session = sessionFor(id)
    if (!session?.conflict) return false
    session.revision = session.conflict.currentRevision
    session.savedAt = session.conflict.savedAt
    session.operation = 'idle'
    session.conflict = null
    return save(id)
  }

  return {
    sessions,
    sessionFor,
    dirtyDocumentIds,
    hasDirtySessions,
    discard,
    load,
    clear,
    setTitle,
    setContent,
    setNotes,
    setScrollTop,
    save,
    reloadServerCopy,
    keepMine,
    loadSnapshots,
    takeSnapshot,
    renameSnapshot,
    loadSnapshotDetail,
    restoreSnapshot,
    deleteSnapshot,
  }
})
