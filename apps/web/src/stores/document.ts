import type { DocumentDto, EditorDocument, SaveDocumentRequest } from '@scr/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ApiRequestError } from '../api/client.js'
import { documentApi } from '../api/documents.js'
import { countText, editorText } from '../features/editor/counts.js'

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
  let loadSequence = 0

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
    try {
      const document = await documentApi.get(id)
      if (sequence !== loadSequence) return false
      applyServerDocument(document)
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
    isDirty,
    saveState,
    conflict,
    errorMessage,
    loading,
    load,
    clear,
    setTitle,
    setContent,
    setNotes,
    save,
    reloadServerCopy,
    keepMine,
  }
})
