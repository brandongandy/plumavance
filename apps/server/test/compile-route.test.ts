import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CompileArtifact, ConverterSet } from '../src/compile/converters.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('compile route', () => {
  let temporary: TemporaryDatabase

  beforeEach(async () => { temporary = await createTemporaryDatabase() })
  afterEach(async () => { await temporary.cleanup() })

  test('downloads_and_disposes_the_artifact_once', async () => {
    const output = join(temporary.directory, 'output.md')
    await writeFile(output, '# Draft')
    const dispose = vi.fn(async () => undefined)
    const artifact: CompileArtifact = { path: output, filename: 'Draft.md', mediaType: 'text/markdown', dispose }
    const converters: ConverterSet = { convert: vi.fn(async () => artifact) }
    const app = await createApp({ databasePath: temporary.path, converters })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Chapter' } })
    const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { itemIds: [item.json<{ id: string }>().id], format: 'markdown', includeTitles: true, separateDocuments: true, filename: 'Draft' } })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toContain('Draft.md')
    expect(response.body).toBe('# Draft')
    expect(dispose).toHaveBeenCalledTimes(1)
    await app.close()
  })
})
