import { randomUUID } from 'node:crypto'

import type { DocumentDto, SnapshotDto, SnapshotSummaryDto } from '@pluma/shared'

import type { DocumentRepository } from '../documents/repository.js'
import { ApiError } from '../http/errors.js'
import type { SnapshotRepository } from './repository.js'

function normalizeName(name: string | undefined): string | null {
  const trimmed = name?.trim()
  return trimmed ? trimmed : null
}

export interface SnapshotService {
  list(documentId: string): SnapshotSummaryDto[]
  create(documentId: string, name?: string): SnapshotSummaryDto
  get(snapshotId: string): SnapshotDto
  rename(snapshotId: string, name: string): SnapshotSummaryDto
  restore(snapshotId: string, expectedRevision: number): DocumentDto
  delete(snapshotId: string): void
}

export function createSnapshotService(
  snapshots: SnapshotRepository,
  documents: DocumentRepository,
  clock: () => Date,
): SnapshotService {
  const getSnapshot = (id: string): SnapshotDto => {
    const snapshot = snapshots.find(id)
    if (!snapshot) throw new ApiError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found.')
    return snapshot
  }

  const getDocument = (id: string): DocumentDto => {
    const document = documents.find(id)
    if (!document) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
    return document
  }

  const conflict = (current: DocumentDto): never => {
    throw new ApiError(409, 'DOCUMENT_CONFLICT', 'The document changed in another tab.', {
      currentRevision: current.revision,
      savedAt: current.savedAt,
    })
  }

  return {
    list(documentId) {
      getDocument(documentId)
      return snapshots.list(documentId)
    },
    create(documentId, name) {
      return snapshots.transaction(() => {
        const document = getDocument(documentId)
        return snapshots.create({
          id: randomUUID(),
          documentId,
          name: normalizeName(name),
          contentJson: document.contentJson,
          contentText: document.contentText,
          createdAt: clock().toISOString(),
        })
      })
    },
    get: getSnapshot,
    rename(snapshotId, name) {
      getSnapshot(snapshotId)
      return snapshots.rename(snapshotId, normalizeName(name)) as SnapshotSummaryDto
    },
    restore(snapshotId, expectedRevision) {
      return snapshots.transaction(() => {
        const snapshot = getSnapshot(snapshotId)
        const current = getDocument(snapshot.documentId)
        if (current.revision !== expectedRevision) conflict(current)
        const restored = documents.restoreContent({
          documentId: snapshot.documentId,
          contentJson: snapshot.contentJson,
          contentText: snapshot.contentText,
          expectedRevision,
          savedAt: clock().toISOString(),
        })
        return restored ?? conflict(getDocument(snapshot.documentId))
      })
    },
    delete(snapshotId) {
      getSnapshot(snapshotId)
      snapshots.delete(snapshotId)
    },
  }
}
