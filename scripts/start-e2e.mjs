import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

process.env.DATA_DIR = await mkdtemp(resolve(tmpdir(), 'scr-e2e-'))
process.env.STATIC_ROOT = resolve('apps/web/dist')
process.env.PORT = process.env.PORT ?? '4173'
await import('../apps/server/dist/main.js')
