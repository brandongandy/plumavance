import type Database from 'better-sqlite3'
import type { EditorDocument, SnapshotDto } from '@scr/shared'

interface SnapshotRow {
  id: string
  document_id: string
  name: string | null
  content_json: string
  content_text: string
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

export interface SnapshotRepository {
  transaction<T>(operation: () => T): T
  list(documentId: string): SnapshotDto[]
  find(id: string): SnapshotDto | undefined
  create(snapshot: SnapshotDto): SnapshotDto
  rename(id: string, name: string | null): SnapshotDto | undefined
  delete(id: string): boolean
}

export function createSnapshotRepository(database: Database.Database): SnapshotRepository {
  const find = (id: string): SnapshotDto | undefined => {
    const row = database.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
      | SnapshotRow
      | undefined
    return row ? toSnapshot(row) : undefined
  }

  return {
    transaction: (operation) => database.transaction(operation)(),
    list(documentId) {
      const rows = database
        .prepare('SELECT * FROM snapshots WHERE document_id = ? ORDER BY created_at DESC, id DESC')
        .all(documentId) as SnapshotRow[]
      return rows.map(toSnapshot)
    },
    find,
    create(snapshot) {
      database
        .prepare(
          `INSERT INTO snapshots (id, document_id, name, content_json, content_text, created_at)
           VALUES (@id, @documentId, @name, @contentJson, @contentText, @createdAt)`,
        )
        .run({ ...snapshot, contentJson: JSON.stringify(snapshot.contentJson) })
      return find(snapshot.id) as SnapshotDto
    },
    rename(id, name) {
      const result = database.prepare('UPDATE snapshots SET name = ? WHERE id = ?').run(name, id)
      return result.changes === 0 ? undefined : find(id)
    },
    delete(id) {
      return database.prepare('DELETE FROM snapshots WHERE id = ?').run(id).changes > 0
    },
  }
}
