import { readFileSync } from 'node:fs'

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
    const maxMigrationVersion = version.version
    expect(maxMigrationVersion).toBe(4)
    expect(journalMode).toBe('wal')
    expect(foreignKeys).toBe(1)
    database.close()
  })

  test('migration_adds_writing_defaults_to_existing_projects', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    database.exec(`
      CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
      ${readFileSync(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8')}
      INSERT INTO _migrations VALUES (1, 'initial', '2026-10-10T00:00:00.000Z');
      INSERT INTO projects VALUES ('project-1', 'Novel', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
    `)

    runMigrations(database)

    expect(database.prepare('SELECT project_word_target, daily_word_target, daily_count_mode FROM projects').get()).toEqual({
      project_word_target: null,
      daily_word_target: null,
      daily_count_mode: 'additions',
    })
    database.close()
  })

  test('migration_enforces_writing_settings_and_cascades_word_count_events', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    runMigrations(database)
    database.prepare('INSERT INTO projects (id, name, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?)')
      .run('project-1', 'Novel', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z')

    for (const column of ['project_word_target', 'daily_word_target']) {
      for (const target of [0, -1, 1.5]) {
        expect(() => database.prepare(`UPDATE projects SET ${column} = ? WHERE id = ?`).run(target, 'project-1')).toThrow()
      }
    }
    expect(() => database.prepare('UPDATE projects SET daily_count_mode = ? WHERE id = ?').run('unknown', 'project-1')).toThrow()
    database.prepare('INSERT INTO word_count_events (id, project_id, local_date, delta, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('event-1', 'project-1', '2026-10-12', -5, '2026-10-12T00:00:00.000Z')
    expect(database.prepare('SELECT delta FROM word_count_events').get()).toEqual({ delta: -5 })

    database.prepare('DELETE FROM projects WHERE id = ?').run('project-1')

    expect(database.prepare('SELECT count(*) AS count FROM word_count_events').get()).toEqual({ count: 0 })
    database.close()
  })

  test('migration_populates_and_maintains_document_search', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    database.exec(`
      CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      ${readFileSync(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8')}
      INSERT INTO _migrations VALUES (1, 'initial', '2026-10-10T00:00:00.000Z');
      INSERT INTO projects VALUES ('project-1', 'Novel', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
      INSERT INTO binder_items
        (id, project_id, parent_id, kind, title, position, trashed_at, created_at, updated_at)
      VALUES
        ('document-1', 'project-1', NULL, 'document', 'Opening', 0, NULL, '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
      INSERT INTO documents
        (binder_item_id, content_json, content_text, notes_text, revision, saved_at)
      VALUES
        ('document-1', '{"type":"doc","content":[]}', 'old lantern', '', 0, '2026-10-10T00:00:00.000Z');
    `)

    runMigrations(database)

    const match = (query: string): string[] => database
      .prepare('SELECT binder_item_id FROM document_search WHERE document_search MATCH ?')
      .all(`"${query}"`)
      .map((row) => (row as { binder_item_id: string }).binder_item_id)
    expect(match('old lantern')).toEqual(['document-1'])

    database.prepare('UPDATE documents SET content_text = ? WHERE binder_item_id = ?').run('new moonlight', 'document-1')
    database.prepare('UPDATE binder_items SET title = ? WHERE id = ?').run('Renamed Chapter', 'document-1')
    expect(match('moonlight')).toEqual(['document-1'])
    expect(match('Renamed')).toEqual(['document-1'])
    expect(match('lantern')).toEqual([])

    database.prepare('DELETE FROM binder_items WHERE id = ?').run('document-1')
    expect(database.prepare('SELECT count(*) AS count FROM document_search').get()).toEqual({ count: 0 })
    database.close()
  })

  test('migration_backfills_exact_snapshot_word_counts', async () => {
    temporary = await createTemporaryDatabase()
    const database = openDatabase(temporary.path)
    database.exec(`
      CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      ${readFileSync(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8')}
      ${readFileSync(new URL('../src/db/migrations/002_document_search.sql', import.meta.url), 'utf8')}
      INSERT INTO _migrations VALUES
        (1, 'initial', '2026-10-10T00:00:00.000Z'),
        (2, 'document-search', '2026-10-10T00:00:00.000Z');
      INSERT INTO projects VALUES ('project-1', 'Novel', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
      INSERT INTO binder_items
        (id, project_id, parent_id, kind, title, position, trashed_at, created_at, updated_at)
      VALUES
        ('document-1', 'project-1', NULL, 'document', 'Opening', 0, NULL, '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
      INSERT INTO documents
        (binder_item_id, content_json, content_text, notes_text, revision, saved_at)
      VALUES
        ('document-1', '{"type":"doc","content":[]}', '', '', 0, '2026-10-10T00:00:00.000Z');
    `)
    const samples = ['', '   ', 'one\ntwo', 'one\u00a0two\u2003three']
    const insert = database.prepare(
      `INSERT INTO snapshots (id, document_id, name, content_json, content_text, created_at)
       VALUES (?, 'document-1', NULL, '{"type":"doc","content":[]}', ?, '2026-10-10T00:00:00.000Z')`,
    )
    samples.forEach((text, index) => insert.run(`snapshot-${index}`, text))

    runMigrations(database)

    const rows = database
      .prepare('SELECT id, word_count FROM snapshots ORDER BY id')
      .all() as Array<{ id: string; word_count: number }>
    expect(rows.map((row) => row.word_count)).toEqual(
      samples.map((text) => (text.trim() ? text.trim().split(/\s+/u).length : 0)),
    )
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
