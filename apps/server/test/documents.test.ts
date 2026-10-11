import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

interface CreatedRecord {
  id: string
}

describe('document routes', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase
  let documentId: string

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    let tick = 0
    app = await createApp({
      databasePath: temporary.path,
      clock: () => new Date(Date.UTC(2026, 9, 10, 1, 0, tick++)),
    })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.json<CreatedRecord>().id}/items`,
      payload: { kind: 'document', parentId: null, title: 'Untitled' },
    })
    documentId = created.json<CreatedRecord>().id
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  test('loads_a_valid_empty_document', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/documents/${documentId}` })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: documentId,
      title: 'Untitled',
      contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentText: '',
      notesText: '',
      revision: 0,
    })
  })

  test('saves_title_rich_content_and_notes_in_one_revision', async () => {
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello   ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'world' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
      ],
    }
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      payload: {
        title: 'Opening',
        contentJson,
        notesText: 'Keep the tension quiet.',
        expectedRevision: 0,
      },
    })
    const reloaded = await app.inject({ method: 'GET', url: `/api/documents/${documentId}` })

    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({
      title: 'Opening',
      contentText: 'Hello world\n\nSecond line',
      notesText: 'Keep the tension quiet.',
      revision: 1,
    })
    expect(reloaded.json()).toEqual(saved.json())
  })

  test('rejects_unknown_editor_nodes_without_partially_renaming', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      payload: {
        title: 'Must not stick',
        contentJson: { type: 'doc', content: [{ type: 'script', content: [] }] },
        notesText: '',
        expectedRevision: 0,
      },
    })
    const reloaded = await app.inject({ method: 'GET', url: `/api/documents/${documentId}` })

    expect(response.statusCode).toBe(400)
    expect(reloaded.json()).toMatchObject({ title: 'Untitled', revision: 0 })
  })

  test('returns_conflict_metadata_and_preserves_the_server_copy_for_a_stale_save', async () => {
    const firstPayload = {
      title: 'Server copy',
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved' }] }] },
      notesText: 'Server notes',
      expectedRevision: 0,
    }
    await app.inject({ method: 'PUT', url: `/api/documents/${documentId}`, payload: firstPayload })
    const stale = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      payload: {
        title: 'Local copy',
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local' }] }] },
        notesText: 'Local notes',
        expectedRevision: 0,
      },
    })
    const reloaded = await app.inject({ method: 'GET', url: `/api/documents/${documentId}` })

    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      code: 'DOCUMENT_CONFLICT',
      details: { currentRevision: 1, savedAt: expect.any(String) },
    })
    expect(reloaded.json()).toMatchObject({
      title: 'Server copy',
      contentText: 'Saved',
      notesText: 'Server notes',
      revision: 1,
    })
  })
})
