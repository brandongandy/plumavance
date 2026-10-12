import type { RecordWordCountEventRequest } from '@pluma/shared'
import type Database from 'better-sqlite3'

export interface WordCountEventRecord extends RecordWordCountEventRequest {
  projectId: string
  createdAt: string
}

export interface WordCountRepository {
  projectWordCount(projectId: string): number
  dailyWordCount(projectId: string, localDate: string): number
  recordEvent(input: WordCountEventRecord): { inserted: boolean; dailyWordCount: number }
}

interface WordCountRow {
  word_count: number
}

export function createWordCountRepository(database: Database.Database): WordCountRepository {
  const projectTotal = database.prepare(`
    WITH RECURSIVE trashed_items(id) AS (
      SELECT id FROM binder_items WHERE project_id = @projectId AND trashed_at IS NOT NULL
      UNION
      SELECT item.id FROM binder_items AS item
      JOIN trashed_items AS parent ON item.parent_id = parent.id
      WHERE item.project_id = @projectId
    )
    SELECT COALESCE(SUM(pluma_word_count(document.content_text)), 0) AS word_count
    FROM documents AS document
    JOIN binder_items AS item ON document.binder_item_id = item.id
    WHERE item.project_id = @projectId
      AND item.id NOT IN (SELECT id FROM trashed_items)
  `)
  const dailyTotal = database.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS word_count
    FROM word_count_events WHERE project_id = ? AND local_date = ?
  `)
  const insertEvent = database.prepare(`
    INSERT OR IGNORE INTO word_count_events (id, project_id, local_date, delta, created_at)
    VALUES (@eventId, @projectId, @localDate, @delta, @createdAt)
  `)
  const dailyWordCount = (projectId: string, localDate: string): number =>
    (dailyTotal.get(projectId, localDate) as WordCountRow).word_count
  const recordEvent = database.transaction((input: WordCountEventRecord) => {
    const result = insertEvent.run(input)
    return {
      inserted: result.changes > 0,
      dailyWordCount: dailyWordCount(input.projectId, input.localDate),
    }
  })

  return {
    projectWordCount: (projectId) => (projectTotal.get({ projectId }) as WordCountRow).word_count,
    dailyWordCount,
    recordEvent,
  }
}
