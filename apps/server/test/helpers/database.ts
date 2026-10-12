import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TemporaryDatabase {
  directory: string
  path: string
  cleanup(): Promise<void>
}

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'pluma-test-'))
  return {
    directory,
    path: join(directory, 'pluma.sqlite'),
    cleanup: async () => rm(directory, { recursive: true, force: true }),
  }
}
