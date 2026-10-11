import { afterEach, describe, expect, test } from 'vitest'

import { openDatabase } from '../src/db/client.js'
import { runMigrations } from '../src/db/migrate.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('database migrations', () => {
  let temporary: TemporaryDatabase | undefined

  afterEach(async () => {
    await temporary?.cleanup()
  })

  test('running_migrations_twice_is_idempotent', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)

    runMigrations(database)
    runMigrations(database)

    const version = database.prepare('select max(version) as version from _migrations').get() as {
      version: number
    }
    const journalMode = database.pragma('journal_mode', { simple: true })
    const foreignKeys = database.pragma('foreign_keys', { simple: true })
    expect(version.version).toBe(1)
    expect(journalMode).toBe('wal')
    expect(foreignKeys).toBe(1)
    database.close()
  })

  test('reopening_a_database_retains_inserted_rows', async () => {
    temporary = await createTemporaryDatabase()
    const first = openDatabase(temporary.path)
    runMigrations(first)
    first
      .prepare(
        'insert into projects (id, name, created_at, updated_at, last_opened_at) values (?, ?, ?, ?, ?)',
      )
      .run('project-1', 'A retained manuscript', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z')
    first.close()

    const reopened = openDatabase(temporary.path)
    runMigrations(reopened)
    const project = reopened.prepare('select name from projects where id = ?').get('project-1') as {
      name: string
    }

    expect(project.name).toBe('A retained manuscript')
    reopened.close()
  })
})
