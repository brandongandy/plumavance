import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { DocumentDto } from '@pluma/shared'
import type { CompileArtifact, ConverterSet } from '../src/compile/converters.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createApp } from '../src/app.js'
import type { BinderService } from '../src/binder/service.js'
import { createBinderRepository } from '../src/binder/repository.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'
import { createCompileService } from '../src/compile/service.js'
import { openDatabase } from '../src/db/client.js'
import { runMigrations } from '../src/db/migrate.js'
import {
  createDocumentRepository,
  type DocumentRepository,
} from '../src/documents/repository.js'

describe('compile route', () => {
  let temporary: TemporaryDatabase

  beforeEach(async () => { temporary = await createTemporaryDatabase() })
  afterEach(async () => { await temporary.cleanup() })

  test('find_many_loads_requested_documents_in_one_repository_call', () => {
    const database = openDatabase(temporary.path)
    runMigrations(database)
    database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)').run(
      '11111111-1111-4111-8111-111111111111',
      'Novel',
      '2026-10-10T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
      '2026-10-10T00:00:00.000Z',
    )
    const binder = createBinderRepository(database)
    const documents = createDocumentRepository(database)
    const ids = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
    ids.forEach((id, position) => binder.create({
      id,
      projectId: '11111111-1111-4111-8111-111111111111',
      parentId: null,
      kind: 'document',
      title: `Chapter ${position + 1}`,
      position,
      trashedAt: null,
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
    }))
    const prepare = vi.spyOn(database, 'prepare')
    const bulkDocuments = documents as DocumentRepository & {
      findMany(requestedIds: readonly string[]): Map<string, DocumentDto>
    }

    expect([...bulkDocuments.findMany(ids).keys()]).toEqual(ids)
    expect(prepare).toHaveBeenCalledTimes(1)
    prepare.mockClear()
    expect(bulkDocuments.findMany([])).toEqual(new Map())
    expect(prepare).not.toHaveBeenCalled()
    database.close()
  })

  test('compile_bulk_loads_selected_documents_once', async () => {
    const stamp = '2026-10-10T00:00:00.000Z'
    const folderId = '11111111-1111-4111-8111-111111111111'
    const firstId = '22222222-2222-4222-8222-222222222222'
    const secondId = '33333333-3333-4333-8333-333333333333'
    const items = [
      { id: folderId, projectId: 'project', parentId: null, kind: 'folder' as const, title: 'Part', position: 0, trashedAt: null, createdAt: stamp, updatedAt: stamp },
      { id: firstId, projectId: 'project', parentId: folderId, kind: 'document' as const, title: 'First', position: 0, trashedAt: null, createdAt: stamp, updatedAt: stamp },
      { id: secondId, projectId: 'project', parentId: folderId, kind: 'document' as const, title: 'Second', position: 1, trashedAt: null, createdAt: stamp, updatedAt: stamp },
    ]
    const documentsById = new Map(items.filter((item) => item.kind === 'document').map((item) => [item.id, {
      id: item.id,
      projectId: 'project',
      title: item.title,
      contentJson: { type: 'doc' as const, content: [{ type: 'paragraph' as const }] },
      contentText: item.title,
      notesText: '',
      revision: 0,
      savedAt: stamp,
    }]))
    const findMany = vi.fn(() => documentsById)
    const find = vi.fn()
    const binder = { listProject: () => ({ items, trashedItems: [] }) } as unknown as BinderService
    const documents = { findMany, find } as unknown as DocumentRepository
    const artifact: CompileArtifact = { path: '/tmp/unused', filename: 'Draft.md', mediaType: 'text/markdown', dispose: async () => undefined }
    const converters: ConverterSet = { convert: vi.fn(async () => artifact) }
    const service = createCompileService(binder, documents, converters)

    await service.compile('project', {
      itemIds: [folderId],
      exportType: 'manuscript',
      format: 'markdown',
      includeTitles: true,
      includeFolderTitles: false,
      sceneSeparator: '#',
      chapterPageBreaks: false,
      filename: 'Draft',
    })

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith([firstId, secondId])
    expect(find).not.toHaveBeenCalled()
  })

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
    const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { itemIds: [item.json<{ id: string }>().id], exportType: 'manuscript', format: 'markdown', includeTitles: true, sceneSeparator: '#', chapterPageBreaks: true, filename: 'Draft' } })

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

    const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { itemIds: [item.json<{ id: string }>().id], exportType: 'manuscript', format: 'markdown', includeTitles: true, sceneSeparator: '#', chapterPageBreaks: true, filename: '日本語' } })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toContain('filename="export.md"')
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.md")
    await app.close()
  })

  test('renders_selected_folder_titles_in_binder_order_when_enabled', async () => {
    const output = join(temporary.directory, 'folder-output.md')
    await writeFile(output, '# Draft')
    const artifact: CompileArtifact = { path: output, filename: 'Draft.md', mediaType: 'text/markdown', dispose: async () => undefined }
    let compiledHtml = ''
    const converters: ConverterSet = {
      convert: vi.fn(async (input) => {
        compiledHtml = input.html
        return artifact
      }),
    }
    const app = await createApp({ databasePath: temporary.path, converters })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const folder = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'folder', parentId: null, title: '<Part One>' } })
    const document = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: folder.json<{ id: string }>().id, title: 'Chapter One' } })

    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/compile`,
      payload: {
        itemIds: [folder.json<{ id: string }>().id, document.json<{ id: string }>().id],
        exportType: 'manuscript',
        format: 'markdown',
        includeTitles: true,
        includeFolderTitles: true,
        sceneSeparator: '#',
        chapterPageBreaks: false,
        filename: 'Draft',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(compiledHtml).toContain('<h1>&lt;Part One&gt;</h1>')
    expect(compiledHtml).toContain('<h2>Chapter One</h2>')
    expect(compiledHtml.indexOf('&lt;Part One&gt;')).toBeLessThan(compiledHtml.indexOf('Chapter One'))
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
      body: JSON.stringify({ itemIds: [item.json<{ id: string }>().id], exportType: 'manuscript', format: 'markdown', includeTitles: true, sceneSeparator: '#', chapterPageBreaks: true, filename: 'Draft' }),
      signal: controller.signal,
    })
    await started
    controller.abort()
    await expect(response).rejects.toThrow()
    await vi.waitFor(() => expect(aborted).toBe(true))
    await app.close()
  })

  test('rejects_invalid_export_type_format_and_font_combinations', async () => {
    const app = await createApp({ databasePath: temporary.path, converters: { convert: vi.fn() } })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Chapter' } })
    const common = { itemIds: [item.json<{ id: string }>().id], includeTitles: true, sceneSeparator: '#', chapterPageBreaks: true, filename: 'Draft' }

    const missingFont = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, exportType: 'ereader', format: 'pdf' } })
    const invalidFormat = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, exportType: 'ereader', format: 'markdown', font: 'serif' } })
    const manuscriptFont = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, exportType: 'manuscript', format: 'pdf', font: 'serif' } })

    expect(missingFont.statusCode).toBe(400)
    expect(invalidFormat.statusCode).toBe(400)
    expect(manuscriptFont.statusCode).toBe(400)
    await app.close()
  })

  test('accepts_supported_paperback_sizes_and_rejects_unknown_sizes', async () => {
    const output = join(temporary.directory, 'paperback-output.pdf')
    await writeFile(output, '%PDF')
    const artifact: CompileArtifact = { path: output, filename: 'Draft.pdf', mediaType: 'application/pdf', dispose: async () => undefined }
    const app = await createApp({ databasePath: temporary.path, converters: { convert: vi.fn(async () => artifact) } })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Chapter' } })
    const common = {
      itemIds: [item.json<{ id: string }>().id],
      exportType: 'ereader',
      format: 'pdf',
      font: 'serif',
      includeTitles: true,
      sceneSeparator: '#',
      chapterPageBreaks: true,
      filename: 'Draft',
    }

    for (const pageSize of ['mass-market', 'digest', 'trade']) {
      const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, pageSize } })
      expect(response.statusCode).toBe(200)
    }
    const unsupported = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, pageSize: 'letter' } })
    expect(unsupported.statusCode).toBe(400)
    await app.close()
  })

  test('accepts_empty_and_twenty_character_scene_separators_but_rejects_twenty_one', async () => {
    const output = join(temporary.directory, 'separator-output.md')
    await writeFile(output, '# Draft')
    const artifact: CompileArtifact = { path: output, filename: 'Draft.md', mediaType: 'text/markdown', dispose: async () => undefined }
    const app = await createApp({ databasePath: temporary.path, converters: { convert: vi.fn(async () => artifact) } })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const projectId = project.json<{ id: string }>().id
    const item = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/items`, payload: { kind: 'document', parentId: null, title: 'Scene' } })
    const common = {
      itemIds: [item.json<{ id: string }>().id],
      exportType: 'manuscript',
      format: 'markdown',
      includeTitles: true,
      chapterPageBreaks: true,
      filename: 'Draft',
    }

    const empty = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, sceneSeparator: '' } })
    const twenty = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, sceneSeparator: '12345678901234567890' } })
    const twentyOne = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/compile`, payload: { ...common, sceneSeparator: '123456789012345678901' } })

    expect(empty.statusCode).toBe(200)
    expect(twenty.statusCode).toBe(200)
    expect(twentyOne.statusCode).toBe(400)
    await app.close()
  })
})
