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

  test('uses_an_ascii_fallback_and_utf8_content_disposition_for_unicode_filenames', async () => {
    const output = join(temporary.directory, 'output.md')
    await writeFile(output, '# Draft')
    const artifact: CompileArtifact = { path: output, filename: '日本語.md', mediaType: 'text/markdown', dispose: async () => undefined }
    const app = await createApp({ databasePath: temporary.path, converters: { convert: vi.fn(async () => artifact) } })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Chapter' } })

    const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { itemIds: [item.json<{ id: string }>().id], format: 'markdown', includeTitles: true, separateDocuments: true, filename: '日本語' } })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toContain('filename="export.md"')
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.md")
    await app.close()
  })

  test('aborts_conversion_when_the_client_disconnects', async () => {
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let aborted = false
    const converters: ConverterSet = {
      convert: vi.fn((_input, signal) => new Promise((_resolve, reject) => {
        markStarted?.()
        signal?.addEventListener('abort', () => {
          aborted = true
          reject(signal.reason)
        }, { once: true })
      })),
    }
    const app = await createApp({ databasePath: temporary.path, converters })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Chapter' } })
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    const controller = new AbortController()
    const response = fetch(`${address}/api/projects/${projectId}/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemIds: [item.json<{ id: string }>().id], format: 'markdown', includeTitles: true, separateDocuments: true, filename: 'Draft' }),
      signal: controller.signal,
    })
    await started
    controller.abort()
    await expect(response).rejects.toThrow()
    await vi.waitFor(() => expect(aborted).toBe(true))
    await app.close()
  })
})
