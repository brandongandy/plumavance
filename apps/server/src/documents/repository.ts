import type Database from 'better-sqlite3'
import type {
  DocumentDto,
  EditorDocument,
  SearchResultDto,
} from '@pluma/shared'

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
  findMany(ids: readonly string[]): Map<string, DocumentDto>
  save(input: SaveDocumentRecord): DocumentDto | undefined
  restoreContent(input: {
    documentId: string
    contentJson: EditorDocument
    contentText: string
    expectedRevision: number
    savedAt: string
  }): DocumentDto | undefined
  search(projectId: string, query: string, limit?: number): SearchResultDto[]
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
    findMany(ids) {
      if (ids.length === 0) return new Map()
      const rows = database
        .prepare(
          `SELECT b.id, b.project_id, b.title, d.content_json, d.content_text,
                  d.notes_text, d.revision, d.saved_at
           FROM json_each(?) requested
           JOIN binder_items b ON b.id = requested.value
           JOIN documents d ON d.binder_item_id = b.id
           ORDER BY CAST(requested.key AS INTEGER)`,
        )
        .all(JSON.stringify(ids)) as DocumentRow[]
      return new Map(rows.map((row) => [row.id, toDocument(row)]))
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
    restoreContent(input) {
      const changed = database
        .prepare(
          `UPDATE documents
           SET content_json = @contentJson,
               content_text = @contentText,
               revision = revision + 1,
               saved_at = @savedAt
           WHERE binder_item_id = @documentId AND revision = @expectedRevision`,
        )
        .run({ ...input, contentJson: JSON.stringify(input.contentJson) })
      return changed.changes === 0 ? undefined : this.find(input.documentId)
    },
    search(projectId, query, limit = 100) {
      const normalizedLimit = Math.max(1, Math.min(100, limit))
      const common = `WITH RECURSIVE trashed(id) AS (
             SELECT id FROM binder_items WHERE project_id = ? AND trashed_at IS NOT NULL
             UNION ALL
             SELECT child.id FROM binder_items child JOIN trashed parent ON child.parent_id = parent.id
           )`
      const resultColumns = `SELECT b.id, b.title, d.content_text
           FROM binder_items b
           JOIN documents d ON d.binder_item_id = b.id`
      const activeProject = `b.project_id = ?
             AND b.id NOT IN (SELECT id FROM trashed)`
      const rows = query.length >= 3
        ? database
          .prepare(
            `${common}, matches AS (
               SELECT binder_item_id FROM document_search WHERE document_search MATCH ?
             )
             ${resultColumns}
             JOIN matches ON matches.binder_item_id = b.id
             WHERE ${activeProject}
             LIMIT ?`,
          )
          .all(projectId, `"${query.replaceAll('"', '""')}"`, projectId, normalizedLimit)
        : database
          .prepare(
            `${common}
             ${resultColumns}
             WHERE ${activeProject}
               AND (lower(b.title) LIKE ? ESCAPE '\\' OR lower(d.content_text) LIKE ? ESCAPE '\\')
             LIMIT ?`,
          )
          .all(
            projectId,
            projectId,
            `%${query.toLocaleLowerCase().replace(/[\\%_]/g, '\\$&')}%`,
            `%${query.toLocaleLowerCase().replace(/[\\%_]/g, '\\$&')}%`,
            normalizedLimit,
          )
      return (rows as Array<{
        id: string
        title: string
        content_text: string
      }>).map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.content_text.slice(0, 160),
      }))
    },
  }
}
