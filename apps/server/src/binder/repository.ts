import type Database from 'better-sqlite3'
import type { BinderItemDto } from '@pluma/shared'

import type { BinderRecord } from './tree.js'

interface BinderRow {
  id: string
  project_id: string
  parent_id: string | null
  kind: 'folder' | 'document'
  title: string
  position: number
  trashed_at: string | null
  trashed_parent_id: string | null
  trashed_position: number | null
  created_at: string
  updated_at: string
}

function toRecord(row: BinderRow): BinderRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    position: row.position,
    trashedAt: row.trashed_at,
    trashedParentId: row.trashed_parent_id,
    trashedPosition: row.trashed_position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface BinderRepository {
  transaction<T>(operation: () => T): T
  listByProject(projectId: string): BinderRecord[]
  find(id: string): BinderRecord | undefined
  create(item: BinderItemDto): BinderRecord
  rename(id: string, title: string, updatedAt: string): BinderRecord | undefined
  setLocations(
    locations: Array<{ id: string; parentId: string | null; position: number }>,
    updatedAt: string,
  ): void
  setTrash(
    id: string,
    input: {
      parentId: string | null
      position: number
      trashedAt: string | null
      trashedParentId: string | null
      trashedPosition: number | null
      updatedAt: string
    },
  ): void
  delete(id: string): boolean
}

export function createBinderRepository(database: Database.Database): BinderRepository {
  return {
    transaction: (operation) => database.transaction(operation)(),
    listByProject(projectId) {
      const rows = database
        .prepare('SELECT * FROM binder_items WHERE project_id = ? ORDER BY created_at ASC, id ASC')
        .all(projectId) as BinderRow[]
      return rows.map(toRecord)
    },
    find(id) {
      const row = database.prepare('SELECT * FROM binder_items WHERE id = ?').get(id) as
        | BinderRow
        | undefined
      return row ? toRecord(row) : undefined
    },
    create(item) {
      database
        .prepare(
          `INSERT INTO binder_items
            (id, project_id, parent_id, kind, title, position, trashed_at, created_at, updated_at)
           VALUES (@id, @projectId, @parentId, @kind, @title, @position, @trashedAt, @createdAt, @updatedAt)`,
        )
        .run(item)
      if (item.kind === 'document') {
        database
          .prepare(
            `INSERT INTO documents
              (binder_item_id, content_json, content_text, notes_text, revision, saved_at)
             VALUES (?, ?, '', '', 0, ?)`,
          )
          .run(item.id, JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }), item.createdAt)
      }
      return this.find(item.id) as BinderRecord
    },
    rename(id, title, updatedAt) {
      const result = database
        .prepare('UPDATE binder_items SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, updatedAt, id)
      return result.changes === 0 ? undefined : this.find(id)
    },
    setLocations(locations, updatedAt) {
      if (locations.length === 0) return
      database
        .prepare(
          `WITH locations AS (
             SELECT json_extract(value, '$.id') AS id,
                    json_extract(value, '$.parentId') AS parent_id,
                    CAST(json_extract(value, '$.position') AS INTEGER) AS position
             FROM json_each(?)
           )
           UPDATE binder_items AS item
           SET parent_id = locations.parent_id,
               position = locations.position,
               updated_at = ?
           FROM locations
           WHERE item.id = locations.id`,
        )
        .run(JSON.stringify(locations), updatedAt)
    },
    setTrash(id, input) {
      database
        .prepare(
          `UPDATE binder_items
           SET parent_id = @parentId,
               position = @position,
               trashed_at = @trashedAt,
               trashed_parent_id = @trashedParentId,
               trashed_position = @trashedPosition,
               updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({ id, ...input })
    },
    delete(id) {
      return database.prepare('DELETE FROM binder_items WHERE id = ?').run(id).changes > 0
    },
  }
}
