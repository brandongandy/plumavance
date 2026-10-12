import Database from 'better-sqlite3'

import { registerDatabaseFunctions } from './functions.js'

export function openDatabase(path: string): Database.Database {
  const database = new Database(path)
  registerDatabaseFunctions(database)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  return database
}
