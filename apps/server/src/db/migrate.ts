import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  sql: string
}

function loadMigrations(): Migration[] {
  const url = new URL('./migrations/001_initial.sql', import.meta.url)
  return [
    {
      version: 1,
      name: 'initial',
      sql: readFileSync(fileURLToPath(url), 'utf8'),
    },
  ]
}

export function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = database.prepare('SELECT 1 FROM _migrations WHERE version = ?')
  const record = database.prepare(
    'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of loadMigrations()) {
    if (applied.get(migration.version)) continue

    database.transaction(() => {
      database.exec(migration.sql)
      record.run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
