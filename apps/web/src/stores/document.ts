import type {
  DocumentDto,
  EditorDocument,
  SaveDocumentRequest,
  SnapshotDto,
  SnapshotSummaryDto,
} from '@pluma/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

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

const emptyContent: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

function bufferOf(document: DocumentDto): SavedBuffer {
  return {
    title: document.title,
    contentJson: document.contentJson,
    notesText: document.notesText,
  }
}

function sameContent(left: EditorDocument, right: EditorDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const useDocumentStore = defineStore('document', () => {
  const documentId = ref<string | null>(null)
  const title = ref('')
  const contentJson = ref<EditorDocument>(emptyContent)
  const notesText = ref('')
  const revision = ref(0)
  const savedAt = ref('')
  const savedBuffer = ref<SavedBuffer | null>(null)
  const operation = ref<'idle' | 'saving' | 'failed' | 'conflict'>('idle')
  const conflict = ref<ConflictMetadata | null>(null)
  const errorMessage = ref('')
  const loading = ref(false)
  const snapshots = ref<SnapshotSummaryDto[]>([])
  let loadSequence = 0
  let snapshotDetailSequence = 0

  const isCurrent = (id: string, sequence: number): boolean =>
    documentId.value === id && loadSequence === sequence

  const isDirty = computed(() => {
    const saved = savedBuffer.value
    if (!saved || !documentId.value) return false
    return (
      title.value !== saved.title ||
      notesText.value !== saved.notesText ||
      !sameContent(contentJson.value, saved.contentJson)
    )
  })
  const contentText = computed(() => editorText(contentJson.value))
  const counts = computed(() => countText(contentText.value))
  const savedWordCount = computed(() =>
    savedBuffer.value ? countText(editorText(savedBuffer.value.contentJson)).words : 0,
  )
  const saveState = computed<SaveState>(() => {
    if (operation.value !== 'idle') return operation.value
    return isDirty.value ? 'unsaved' : 'saved'
  })

  function applyServerDocument(document: DocumentDto): void {
    documentId.value = document.id
    title.value = document.title
    contentJson.value = document.contentJson
    notesText.value = document.notesText
    revision.value = document.revision
    savedAt.value = document.savedAt
    savedBuffer.value = bufferOf(document)
    operation.value = 'idle'
    conflict.value = null
    errorMessage.value = ''
  }

  async function load(
    id: string,
    confirmDiscard: () => boolean = () => window.confirm('Discard unsaved changes?'),
    force = false,
  ): Promise<boolean> {
    if (!force && documentId.value && documentId.value !== id && isDirty.value && !confirmDiscard()) {
      return false
    }
    const sequence = ++loadSequence
    loading.value = true
    errorMessage.value = ''
    snapshots.value = []
    try {
      const document = await documentApi.get(id)
      if (sequence !== loadSequence) return false
      applyServerDocument(document)
      void loadSnapshotsFor(document.id, sequence)
      return true
    } catch (error) {
      if (sequence === loadSequence) {
        operation.value = 'failed'
        errorMessage.value = error instanceof Error ? error.message : 'The document could not be loaded.'
      }
      return false
    } finally {
      if (sequence === loadSequence) loading.value = false
    }
  }

  function clear(): void {
    loadSequence += 1
    documentId.value = null
    title.value = ''
    contentJson.value = emptyContent
    notesText.value = ''
    revision.value = 0
    savedAt.value = ''
    savedBuffer.value = null
    operation.value = 'idle'
    conflict.value = null
    errorMessage.value = ''
    loading.value = false
    snapshots.value = []
  }

  async function loadSnapshotsFor(id: string, sequence: number): Promise<void> {
    try {
      const loaded = await snapshotApi.list(id)
      if (isCurrent(id, sequence)) snapshots.value = loaded
    } catch (error) {
      if (isCurrent(id, sequence)) {
        errorMessage.value = error instanceof Error ? error.message : 'Snapshots could not be loaded.'
      }
    }
  }

  async function loadSnapshots(): Promise<void> {
    if (!documentId.value) {
      snapshots.value = []
      return
    }
    await loadSnapshotsFor(documentId.value, loadSequence)
  }

  async function takeSnapshot(name: string): Promise<boolean> {
    const id = documentId.value
    const sequence = loadSequence
    if (!id || isDirty.value) return false
    const trimmed = name.trim()
    const snapshot = await snapshotApi.create(id, trimmed || undefined)
    if (!isCurrent(id, sequence) || snapshot.documentId !== id) return false
    snapshots.value = [snapshot, ...snapshots.value]
    return true
  }

  async function renameSnapshot(snapshotId: string, name: string): Promise<void> {
    const id = documentId.value
    const sequence = loadSequence
    if (!id || !snapshots.value.some((snapshot) => snapshot.id === snapshotId && snapshot.documentId === id)) return
    const renamed = await snapshotApi.rename(snapshotId, name.trim())
    if (!isCurrent(id, sequence) || renamed.documentId !== id) return
    snapshots.value = snapshots.value.map((snapshot) =>
      snapshot.id === renamed.id ? renamed : snapshot,
    )
  }

  async function loadSnapshotDetail(snapshotId: string): Promise<SnapshotDto | undefined> {
    const id = documentId.value
    const sequence = loadSequence
    const detailSequence = ++snapshotDetailSequence
    if (!id || !snapshots.value.some((snapshot) => snapshot.id === snapshotId && snapshot.documentId === id)) {
      return undefined
    }
    try {
      const snapshot = await snapshotApi.get(snapshotId)
      if (
        !isCurrent(id, sequence) ||
        detailSequence !== snapshotDetailSequence ||
        snapshot.documentId !== id
      ) return undefined
      return snapshot
    } catch (error) {
      if (isCurrent(id, sequence) && detailSequence === snapshotDetailSequence) {
        errorMessage.value = error instanceof Error ? error.message : 'The snapshot could not be loaded.'
      }
      return undefined
    }
  }

  async function restoreSnapshot(snapshotId: string): Promise<boolean> {
    const id = documentId.value
    const sequence = loadSequence
    if (!id || isDirty.value || !snapshots.value.some((snapshot) => snapshot.id === snapshotId && snapshot.documentId === id)) return false
    const expectedRevision = revision.value
    try {
      const restored = await snapshotApi.restore(snapshotId, expectedRevision)
      if (!isCurrent(id, sequence) || restored.id !== id) return false
      useWritingProgressStore().accountSavedBody(restored.projectId, savedWordCount.value, countText(editorText(restored.contentJson)).words)
      applyServerDocument(restored)
      return true
    } catch (error) {
      if (isCurrent(id, sequence)) {
        errorMessage.value = error instanceof Error ? error.message : 'The snapshot could not be restored.'
      }
      return false
    }
  }

  async function deleteSnapshot(snapshotId: string): Promise<void> {
    const id = documentId.value
    const sequence = loadSequence
    if (!id || !snapshots.value.some((snapshot) => snapshot.id === snapshotId && snapshot.documentId === id)) return
    await snapshotApi.delete(snapshotId)
    if (!isCurrent(id, sequence)) return
    snapshots.value = snapshots.value.filter((snapshot) => snapshot.id !== snapshotId)
  }

  function setTitle(value: string): void {
    title.value = value
    if (operation.value === 'failed') operation.value = 'idle'
  }

  function setContent(value: EditorDocument): void {
    contentJson.value = value
    if (operation.value === 'failed') operation.value = 'idle'
  }

  function setNotes(value: string): void {
    notesText.value = value
    if (operation.value === 'failed') operation.value = 'idle'
  }

  async function save(): Promise<boolean> {
    const id = documentId.value
    const sequence = loadSequence
    if (!id || operation.value === 'saving') return false
    if (!title.value.trim()) {
      operation.value = 'failed'
      errorMessage.value = 'Document title cannot be blank.'
      return false
    }
    const payload: SaveDocumentRequest = {
      title: title.value.trim(),
      contentJson: contentJson.value,
      notesText: notesText.value,
      expectedRevision: revision.value,
    }
    operation.value = 'saving'
    errorMessage.value = ''
    conflict.value = null
    try {
      const saved = await documentApi.save(id, payload)
      if (!isCurrent(id, sequence) || saved.id !== id) return false
      useWritingProgressStore().accountSavedBody(saved.projectId, savedWordCount.value, countText(editorText(saved.contentJson)).words)
      revision.value = saved.revision
      savedAt.value = saved.savedAt
      savedBuffer.value = bufferOf(saved)
      const bufferStillMatchesRequest =
        title.value.trim() === payload.title &&
        notesText.value === payload.notesText &&
        sameContent(contentJson.value, payload.contentJson)
      if (bufferStillMatchesRequest) {
        title.value = saved.title
        contentJson.value = saved.contentJson
        notesText.value = saved.notesText
      }
      operation.value = 'idle'
      return true
    } catch (error) {
      if (!isCurrent(id, sequence)) return false
      if (error instanceof ApiRequestError && error.status === 409 && error.code === 'DOCUMENT_CONFLICT') {
        const details = error.details as Partial<ConflictMetadata> | undefined
        conflict.value = {
          currentRevision: details?.currentRevision ?? revision.value,
          savedAt: details?.savedAt ?? savedAt.value,
        }
        operation.value = 'conflict'
      } else {
        operation.value = 'failed'
      }
      errorMessage.value = error instanceof Error ? error.message : 'The document could not be saved.'
      return false
    }
  }

  async function reloadServerCopy(): Promise<boolean> {
    return documentId.value ? load(documentId.value, () => true, true) : false
  }

  async function keepMine(): Promise<boolean> {
    if (!conflict.value) return false
    revision.value = conflict.value.currentRevision
    savedAt.value = conflict.value.savedAt
    operation.value = 'idle'
    conflict.value = null
    return save()
  }

  return {
    documentId,
    title,
    contentJson,
    contentText,
    notesText,
    revision,
    savedAt,
    counts,
    savedWordCount,
    isDirty,
    saveState,
    conflict,
    errorMessage,
    loading,
    snapshots,
    load,
    clear,
    setTitle,
    setContent,
    setNotes,
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
