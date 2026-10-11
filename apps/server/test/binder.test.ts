import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

interface ProjectRecord {
  id: string
}

interface BinderItemRecord {
  id: string
  parentId: string | null
  position: number
  title: string
}

interface ProjectDetail {
  items: BinderItemRecord[]
  trashedItems: BinderItemRecord[]
}

describe('binder routes', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase
  let projectId: string

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    app = await createApp({ databasePath: temporary.path })
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    projectId = response.json<ProjectRecord>().id
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  async function createItem(
    kind: 'folder' | 'document',
    title: string,
    parentId: string | null = null,
  ): Promise<BinderItemRecord> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/items`,
      payload: { kind, parentId, title },
    })
    expect(response.statusCode).toBe(201)
    return response.json<BinderItemRecord>()
  }

  async function detail(): Promise<ProjectDetail> {
    const response = await app.inject({ method: 'GET', url: `/api/projects/${projectId}` })
    expect(response.statusCode).toBe(200)
    return response.json<ProjectDetail>()
  }

  test('creates_documents_and_folders_with_contiguous_sibling_positions', async () => {
    const folder = await createItem('folder', 'Part One')
    const document = await createItem('document', 'Chapter One')
    const nested = await createItem('document', 'Scene One', folder.id)

    expect([folder.position, document.position, nested.position]).toEqual([0, 1, 0])
    expect((await detail()).items.map((item) => item.title)).toEqual([
      'Part One',
      'Scene One',
      'Chapter One',
    ])
  })

  test('reorders_and_reparents_items_while_renumbering_both_sibling_groups', async () => {
    const folder = await createItem('folder', 'Part One')
    const first = await createItem('document', 'First')
    const second = await createItem('document', 'Second')

    const moved = await app.inject({
      method: 'POST',
      url: `/api/items/${second.id}/move`,
      payload: { parentId: folder.id, index: 0 },
    })
    const reordered = await app.inject({
      method: 'POST',
      url: `/api/items/${first.id}/move`,
      payload: { parentId: null, index: 0 },
    })
    const items = (await detail()).items

    expect(moved.json()).toMatchObject({ parentId: folder.id, position: 0 })
    expect(reordered.json()).toMatchObject({ parentId: null, position: 0 })
    expect(items.filter((item) => item.parentId === null).map((item) => item.position)).toEqual([0, 1])
  })

  test('hides_a_trashed_subtree_and_restores_to_root_when_its_parent_is_gone', async () => {
    const parent = await createItem('folder', 'Discarded Part')
    const child = await createItem('document', 'Recovered Scene', parent.id)

    await app.inject({ method: 'POST', url: `/api/items/${child.id}/trash` })
    await app.inject({ method: 'POST', url: `/api/items/${parent.id}/trash` })
    await app.inject({ method: 'DELETE', url: `/api/items/${parent.id}` })
    const trashed = await detail()

    expect(trashed.items).toEqual([])
    expect(trashed.trashedItems.map((item) => item.title)).toEqual(['Recovered Scene'])

    const restored = await app.inject({ method: 'POST', url: `/api/items/${child.id}/restore` })
    expect(restored.json()).toMatchObject({ parentId: null, position: 0 })
    expect((await detail()).items.map((item) => item.title)).toEqual(['Recovered Scene'])
  })

  test('rejects_invalid_moves_and_titles_without_mutating_the_tree', async () => {
    const outer = await createItem('folder', 'Outer')
    const inner = await createItem('folder', 'Inner', outer.id)
    const otherProject = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Other' } })
    const otherFolder = await app.inject({
      method: 'POST',
      url: `/api/projects/${otherProject.json<ProjectRecord>().id}/items`,
      payload: { kind: 'folder', parentId: null, title: 'Foreign' },
    })

    const attempts = [
      app.inject({ method: 'POST', url: `/api/items/${outer.id}/move`, payload: { parentId: outer.id, index: 0 } }),
      app.inject({ method: 'POST', url: `/api/items/${outer.id}/move`, payload: { parentId: inner.id, index: 0 } }),
      app.inject({
        method: 'POST',
        url: `/api/items/${outer.id}/move`,
        payload: { parentId: otherFolder.json<BinderItemRecord>().id, index: 0 },
      }),
      app.inject({ method: 'POST', url: `/api/items/${outer.id}/move`, payload: { parentId: null, index: -1 } }),
      app.inject({ method: 'PATCH', url: `/api/items/${outer.id}`, payload: { title: '   ' } }),
    ]
    const responses = await Promise.all(attempts)
    const items = (await detail()).items

    expect(responses.map((response) => response.statusCode)).toEqual([409, 409, 409, 400, 400])
    expect(items.map(({ title, parentId, position }) => ({ title, parentId, position }))).toEqual([
      { title: 'Outer', parentId: null, position: 0 },
      { title: 'Inner', parentId: outer.id, position: 0 },
    ])
  })

  test('does_not_allow_document_titles_to_bypass_the_document_revision_contract', async () => {
    const document = await createItem('document', 'Original')
    const folder = await createItem('folder', 'Old folder')

    const rejected = await app.inject({ method: 'PATCH', url: `/api/items/${document.id}`, payload: { title: 'Bypass' } })
    const renamedFolder = await app.inject({ method: 'PATCH', url: `/api/items/${folder.id}`, payload: { title: 'New folder' } })

    expect(rejected.statusCode).toBe(409)
    expect(rejected.json()).toMatchObject({ code: 'DOCUMENT_RENAME_REQUIRES_SAVE' })
    expect(renamedFolder.statusCode).toBe(200)
    expect(renamedFolder.json()).toMatchObject({ title: 'New folder' })
  })
})
