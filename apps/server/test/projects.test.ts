import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('project routes', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase
  let tick = 0

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    app = await createApp({
      databasePath: temporary.path,
      clock: () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++)),
    })
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  test('creates_multiple_projects_and_orders_them_by_last_opened', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: ' First ' } })
    const second = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Second' } })
    const firstProject = first.json<{ id: string; name: string }>()
    const secondProject = second.json<{ id: string }>()

    await app.inject({ method: 'GET', url: `/api/projects/${firstProject.id}` })
    const list = await app.inject({ method: 'GET', url: '/api/projects' })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(firstProject.name).toBe('First')
    expect(list.json<Array<{ id: string }>>().map((project) => project.id)).toEqual([
      firstProject.id,
      secondProject.id,
    ])
  })

  test('rejects_whitespace_only_names', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '   ' } })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  test('renames_and_deletes_only_with_matching_confirmation', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const project = created.json<{ id: string }>()

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      payload: { name: 'Revised Novel' },
    })
    const rejected = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      payload: { confirmation: 'Novel' },
    })
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      payload: { confirmation: 'Revised Novel' },
    })

    expect(renamed.json()).toMatchObject({ name: 'Revised Novel' })
    expect(rejected.statusCode).toBe(409)
    expect(deleted.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/projects/${project.id}` })).statusCode).toBe(404)
  })
})
