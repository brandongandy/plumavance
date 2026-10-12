import type Database from 'better-sqlite3'

export function countWords(value: unknown): number {
  if (typeof value !== 'string') return 0
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/u).length : 0
}

export function registerDatabaseFunctions(database: Database.Database): void {
  database.function('pluma_word_count', { deterministic: true }, countWords)
}
