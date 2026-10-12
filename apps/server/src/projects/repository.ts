import type Database from 'better-sqlite3'
import type { DailyCountMode, ProjectDto, UpdateWritingSettingsRequest } from '@pluma/shared'

interface ProjectRow {
  id: string
  name: string
  created_at: string
  updated_at: string
  last_opened_at: string
  project_word_target: number | null
  daily_word_target: number | null
  daily_count_mode: DailyCountMode
}

function toProject(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    projectWordTarget: row.project_word_target,
    dailyWordTarget: row.daily_word_target,
    dailyCountMode: row.daily_count_mode,
  }
}

export interface ProjectRepository {
  list(): ProjectDto[]
  find(id: string): ProjectDto | undefined
  create(project: ProjectDto): ProjectDto
  rename(id: string, name: string, updatedAt: string): ProjectDto | undefined
  updateWritingSettings(id: string, input: UpdateWritingSettingsRequest, updatedAt: string): ProjectDto | undefined
  touch(id: string, openedAt: string): ProjectDto | undefined
  delete(id: string): boolean
}

export function createProjectRepository(database: Database.Database): ProjectRepository {
  return {
    list() {
      const rows = database
        .prepare('SELECT * FROM projects ORDER BY last_opened_at DESC, created_at DESC, id ASC')
        .all() as ProjectRow[]
      return rows.map(toProject)
    },
    find(id) {
      const row = database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
        | ProjectRow
        | undefined
      return row ? toProject(row) : undefined
    },
    create(project) {
      database
        .prepare(
          `INSERT INTO projects (id, name, created_at, updated_at, last_opened_at,
             project_word_target, daily_word_target, daily_count_mode)
           VALUES (@id, @name, @createdAt, @updatedAt, @lastOpenedAt,
             @projectWordTarget, @dailyWordTarget, @dailyCountMode)`,
        )
        .run(project)
      return project
    },
    rename(id, name, updatedAt) {
      const result = database
        .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
        .run(name, updatedAt, id)
      return result.changes === 0 ? undefined : this.find(id)
    },
    updateWritingSettings(id, input, updatedAt) {
      const result = database
        .prepare(`UPDATE projects
          SET project_word_target = ?, daily_word_target = ?, daily_count_mode = ?, updated_at = ?
          WHERE id = ?`)
        .run(input.projectWordTarget, input.dailyWordTarget, input.dailyCountMode, updatedAt, id)
      return result.changes === 0 ? undefined : this.find(id)
    },
    touch(id, openedAt) {
      const result = database
        .prepare('UPDATE projects SET last_opened_at = ?, updated_at = ? WHERE id = ?')
        .run(openedAt, openedAt, id)
      return result.changes === 0 ? undefined : this.find(id)
    },
    delete(id) {
      return database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0
    },
  }
}
