import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

interface IdRecord {
  id: string
}

interface SnapshotRecord extends IdRecord {
  name: string | null
  wordCount: number
  createdAt: string
}

describe('manual snapshot routes', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase
  let documentId: string

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    let tick = 0
    app = await createApp({
      databasePath: temporary.path,
      clock: () => new Date(Date.UTC(2026, 9, 10, 2, 0, tick++)),
    })
    const project = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const document = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.json<IdRecord>().id}/items`,
      payload: { kind: 'document', parentId: null, title: 'Chapter' },
    })
    documentId = document.json<IdRecord>().id
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  async function save(text: string, revision: number, title = 'Chapter', notesText = ''): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      payload: {
        title,
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        notesText,
        expectedRevision: revision,
      },
    })
    expect(response.statusCode).toBe(200)
  }

  async function take(name?: string): Promise<SnapshotRecord> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/documents/${documentId}/snapshots`,
      payload: name === undefined ? {} : { name },
    })
    expect(response.statusCode).toBe(201)
    return response.json<SnapshotRecord>()
  }

  async function list(): Promise<SnapshotRecord[]> {
    const response = await app.inject({ method: 'GET', url: `/api/documents/${documentId}/snapshots` })
    expect(response.statusCode).toBe(200)
    return response.json<SnapshotRecord[]>()
  }

  test('ordinary_saves_never_create_snapshots', async () => {
    await save('Working copy', 0)

    expect(await list()).toEqual([])
  })

  test('snapshot_list_omits_content_bodies', async () => {
    await save('One two three', 0)
    const created = await take('Draft')
    const snapshots = await list()
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/snapshots/${created.id}`,
      payload: { name: 'Milestone' },
    })

    for (const summary of [created, snapshots[0], renamed.json<Record<string, unknown>>()]) {
      expect(summary).toMatchObject({ wordCount: 3 })
      expect(summary).not.toHaveProperty('contentJson')
      expect(summary).not.toHaveProperty('contentText')
    }
  })

  test('snapshot_detail_retains_full_content', async () => {
    await save('Full snapshot prose', 0)
    const snapshot = await take('Draft')

    const detail = await app.inject({ method: 'GET', url: `/api/snapshots/${snapshot.id}` })

    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      contentJson: { type: 'doc' },
      contentText: 'Full snapshot prose',
    })
  })

  test('take_snapshot_copies_only_saved_content_and_lists_newest_first', async () => {
    await save('First saved copy', 0)
    const first = await take('  First pass  ')
    await save('Second saved copy', 1)
    const second = await take('   ')

    expect(first).toMatchObject({ name: 'First pass', wordCount: 3 })
    expect(second).toMatchObject({ name: null, wordCount: 3 })
    expect((await list()).map((snapshot) => snapshot.id)).toEqual([second.id, first.id])
  })

  test('renaming_changes_metadata_without_changing_snapshot_content', async () => {
    await save('Immutable prose', 0)
    const snapshot = await take('Draft')

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/snapshots/${snapshot.id}`,
      payload: { name: '  Milestone  ' },
    })
    const fetched = await app.inject({ method: 'GET', url: `/api/snapshots/${snapshot.id}` })

    expect(renamed.json()).toMatchObject({ name: 'Milestone', wordCount: 2 })
    expect(renamed.json()).not.toHaveProperty('contentText')
    expect(fetched.json()).toMatchObject({ name: 'Milestone', contentText: 'Immutable prose' })
  })

  test('restore_replaces_content_only_increments_revision_and_creates_no_snapshot', async () => {
    await save('Snapshot prose', 0, 'Original title', 'Original notes')
    const snapshot = await take('Keep this')
    await save('Later prose', 1, 'Later title', 'Later notes')

    const restored = await app.inject({
      method: 'POST',
      url: `/api/snapshots/${snapshot.id}/restore`,
      payload: { expectedRevision: 2 },
    })
    const document = await app.inject({ method: 'GET', url: `/api/documents/${documentId}` })

    expect(restored.statusCode).toBe(200)
    expect(restored.json()).toMatchObject({ revision: 3, contentText: 'Snapshot prose' })
    expect(document.json()).toMatchObject({
      title: 'Later title',
      notesText: 'Later notes',
      contentText: 'Snapshot prose',
      revision: 3,
    })
    expect(await list()).toHaveLength(1)

    const stale = await app.inject({
      method: 'POST',
      url: `/api/snapshots/${snapshot.id}/restore`,
      payload: { expectedRevision: 2 },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: 'DOCUMENT_CONFLICT', details: { currentRevision: 3 } })
  })

  test('delete_removes_only_the_selected_snapshot', async () => {
    await save('Saved', 0)
    const first = await take('First')
    const second = await take('Second')

    const deleted = await app.inject({ method: 'DELETE', url: `/api/snapshots/${first.id}` })

    expect(deleted.statusCode).toBe(204)
    expect((await list()).map((snapshot) => snapshot.id)).toEqual([second.id])
  })
})
