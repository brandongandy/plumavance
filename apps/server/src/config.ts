import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

import { z } from 'zod'

const EnvironmentSchema = z.object({
  DATA_DIR: z.string().trim().min(1).default('/data'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  STATIC_ROOT: z.string().trim().min(1).default('/app/public'),
})

export interface AppConfig {
  dataDirectory: string
  databasePath: string
  host: string
  port: number
  staticRoot: string
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.parse(environment)
  const dataDirectory = resolve(parsed.DATA_DIR)
  return {
    dataDirectory,
    databasePath: resolve(dataDirectory, 'pluma.sqlite'),
    host: parsed.HOST,
    port: parsed.PORT,
    staticRoot: resolve(parsed.STATIC_ROOT),
  }
}

export async function ensureDataDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await access(path, constants.R_OK | constants.W_OK)
}
