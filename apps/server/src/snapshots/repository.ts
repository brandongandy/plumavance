import type Database from 'better-sqlite3'
import type { EditorDocument, SnapshotDto, SnapshotSummaryDto } from '@pluma/shared'

interface SnapshotRow {
  id: string
  document_id: string
  name: string | null
  content_json: string
  content_text: string
  created_at: string
}

interface SnapshotSummaryRow {
  id: string
  document_id: string
  name: string | null
  word_count: number
  created_at: string
}

function toSnapshot(row: SnapshotRow): SnapshotDto {
  return {
    id: row.id,
    documentId: row.document_id,
    name: row.name,
    contentJson: JSON.parse(row.content_json) as EditorDocument,
    contentText: row.content_text,
    createdAt: row.created_at,
  }
}

function toSummary(row: SnapshotSummaryRow): SnapshotSummaryDto {
  return {
    id: row.id,
    documentId: row.document_id,
    name: row.name,
    wordCount: row.word_count,
    createdAt: row.created_at,
  }
}

export interface SnapshotRepository {
  transaction<T>(operation: () => T): T
  list(documentId: string): SnapshotSummaryDto[]
  find(id: string): SnapshotDto | undefined
  create(snapshot: SnapshotDto): SnapshotSummaryDto
  rename(id: string, name: string | null): SnapshotSummaryDto | undefined
  delete(id: string): boolean
}

export function createSnapshotRepository(database: Database.Database): SnapshotRepository {
  const find = (id: string): SnapshotDto | undefined => {
    const row = database
      .prepare(
        `SELECT id, document_id, name, content_json, content_text, created_at
         FROM snapshots WHERE id = ?`,
      )
      .get(id) as
      | SnapshotRow
      | undefined
    return row ? toSnapshot(row) : undefined
  }

  const findSummary = (id: string): SnapshotSummaryDto | undefined => {
    const row = database
      .prepare(
        `SELECT id, document_id, name, word_count, created_at
         FROM snapshots WHERE id = ?`,
      )
      .get(id) as SnapshotSummaryRow | undefined
    return row ? toSummary(row) : undefined
  }

  return {
    transaction: (operation) => database.transaction(operation)(),
    list(documentId) {
      const rows = database
        .prepare(
          `SELECT id, document_id, name, word_count, created_at
           FROM snapshots WHERE document_id = ? ORDER BY created_at DESC, id DESC`,
        )
        .all(documentId) as SnapshotSummaryRow[]
      return rows.map(toSummary)
    },
    find,
    create(snapshot) {
      database
        .prepare(
          `INSERT INTO snapshots
            (id, document_id, name, content_json, content_text, word_count, created_at)
           VALUES
            (@id, @documentId, @name, @contentJson, @contentText, pluma_word_count(@contentText), @createdAt)`,
        )
        .run({ ...snapshot, contentJson: JSON.stringify(snapshot.contentJson) })
      return findSummary(snapshot.id) as SnapshotSummaryDto
    },
    rename(id, name) {
      const result = database.prepare('UPDATE snapshots SET name = ? WHERE id = ?').run(name, id)
      return result.changes === 0 ? undefined : findSummary(id)
    },
    delete(id) {
      return database.prepare('DELETE FROM snapshots WHERE id = ?').run(id).changes > 0
    },
  }
}
