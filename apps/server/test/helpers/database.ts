import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TemporaryDatabase {
  directory: string
  path: string
  cleanup(): Promise<void>
}

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const directory = await mkdtemp(join(tmpdir(), 'scr-test-'))
  return {
    directory,
    path: join(directory, 'scr.sqlite'),
    cleanup: async () => rm(directory, { recursive: true, force: true }),
  }
}
