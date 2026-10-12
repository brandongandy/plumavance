import type Database from 'better-sqlite3'
import type { ProjectDto } from '@pluma/shared'

interface ProjectRow {
  id: string
  name: string
  created_at: string
  updated_at: string
  last_opened_at: string
}

function toProject(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  }
}

export interface ProjectRepository {
  list(): ProjectDto[]
  find(id: string): ProjectDto | undefined
  create(project: ProjectDto): ProjectDto
  rename(id: string, name: string, updatedAt: string): ProjectDto | undefined
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
          `INSERT INTO projects (id, name, created_at, updated_at, last_opened_at)
           VALUES (@id, @name, @createdAt, @updatedAt, @lastOpenedAt)`,
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
