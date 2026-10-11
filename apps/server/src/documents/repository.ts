import type Database from 'better-sqlite3'
import type {
  DocumentDto,
  EditorDocument,
  SearchResultDto,
} from '@scr/shared'

interface DocumentRow {
  id: string
  project_id: string
  title: string
  content_json: string
  content_text: string
  notes_text: string
  revision: number
  saved_at: string
}

function toDocument(row: DocumentRow): DocumentDto {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    contentJson: JSON.parse(row.content_json) as EditorDocument,
    contentText: row.content_text,
    notesText: row.notes_text,
    revision: row.revision,
    savedAt: row.saved_at,
  }
}

export interface SaveDocumentRecord {
  documentId: string
  title: string
  contentJson: EditorDocument
  contentText: string
  notesText: string
  expectedRevision: number
  savedAt: string
}

export interface DocumentRepository {
  transaction<T>(operation: () => T): T
  find(id: string): DocumentDto | undefined
  save(input: SaveDocumentRecord): DocumentDto | undefined
  search(projectId: string, query: string): SearchResultDto[]
}

export function createDocumentRepository(database: Database.Database): DocumentRepository {
  return {
    transaction: (operation) => database.transaction(operation)(),
    find(id) {
      const row = database
        .prepare(
          `SELECT b.id, b.project_id, b.title, d.content_json, d.content_text,
                  d.notes_text, d.revision, d.saved_at
           FROM documents d
           JOIN binder_items b ON b.id = d.binder_item_id
           WHERE b.id = ?`,
        )
        .get(id) as DocumentRow | undefined
      return row ? toDocument(row) : undefined
    },
    save(input) {
      const changed = database
        .prepare(
          `UPDATE documents
           SET content_json = @contentJson,
               content_text = @contentText,
               notes_text = @notesText,
               revision = revision + 1,
               saved_at = @savedAt
           WHERE binder_item_id = @documentId AND revision = @expectedRevision`,
        )
        .run({ ...input, contentJson: JSON.stringify(input.contentJson) })
      if (changed.changes === 0) return undefined
      database
        .prepare('UPDATE binder_items SET title = ?, updated_at = ? WHERE id = ?')
        .run(input.title, input.savedAt, input.documentId)
      return this.find(input.documentId)
    },
    search(projectId, query) {
      const pattern = `%${query.toLocaleLowerCase()}%`
      const rows = database
        .prepare(
          `WITH RECURSIVE trashed(id) AS (
             SELECT id FROM binder_items WHERE project_id = ? AND trashed_at IS NOT NULL
             UNION ALL
             SELECT child.id FROM binder_items child JOIN trashed parent ON child.parent_id = parent.id
           )
           SELECT b.id, b.title, d.content_text
           FROM binder_items b
           JOIN documents d ON d.binder_item_id = b.id
           WHERE b.project_id = ?
             AND b.id NOT IN (SELECT id FROM trashed)
             AND (lower(b.title) LIKE ? OR lower(d.content_text) LIKE ?)`,
        )
        .all(projectId, projectId, pattern, pattern) as Array<{
        id: string
        title: string
        content_text: string
      }>
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.content_text.slice(0, 160),
      }))
    },
  }
}
