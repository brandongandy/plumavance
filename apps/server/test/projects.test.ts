import { LocalDateSchema, RecordWordCountEventRequestSchema } from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('word count request schemas', () => {
  test('accepts_real_calendar_dates_including_leap_days', () => {
    for (const date of ['2026-10-12', '2024-02-29', '2000-02-29']) {
      expect(LocalDateSchema.safeParse(date).success).toBe(true)
    }
    for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01']) {
      expect(LocalDateSchema.safeParse(date).success).toBe(false)
    }
  })

  test('validates_compact_signed_word_count_batches', () => {
    const input = { eventId: '11111111-1111-4111-8111-111111111111', localDate: '2026-10-12', delta: -5 }
    expect(RecordWordCountEventRequestSchema.safeParse(input).success).toBe(true)
    expect(RecordWordCountEventRequestSchema.safeParse({ ...input, delta: 0 }).success).toBe(true)
    for (const invalid of [{ eventId: 'invalid' }, { localDate: '2026-02-30' }, { delta: 1.5 }, { extra: true }]) {
      expect(RecordWordCountEventRequestSchema.safeParse({ ...input, ...invalid }).success).toBe(false)
    }
  })
})

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

  test('creates_projects_with_default_writing_settings', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const createdProject = response.json()

    expect(createdProject).toMatchObject({
      projectWordTarget: null,
      dailyWordTarget: null,
      dailyCountMode: 'additions',
    })
  })

  test('persists_and_clears_writing_settings', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const { id, updatedAt, lastOpenedAt } = created.json<{ id: string; updatedAt: string; lastOpenedAt: string }>()
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}/writing-settings`,
      payload: { projectWordTarget: 80_000, dailyWordTarget: 1_000, dailyCountMode: 'net' },
    })
    const updatedProject = response.json()

    expect(response.statusCode).toBe(200)
    expect(updatedProject).toMatchObject({
      projectWordTarget: 80_000,
      dailyWordTarget: 1_000,
      dailyCountMode: 'net',
      lastOpenedAt,
    })
    expect(updatedProject.updatedAt).not.toBe(updatedAt)
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).json()).toEqual([updatedProject])

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}/writing-settings`,
      payload: { projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions' },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({
      projectWordTarget: null,
      dailyWordTarget: null,
      dailyCountMode: 'additions',
    })
    expect((await app.inject({ method: 'GET', url: `/api/projects/${id}` })).json().project).toMatchObject({
      projectWordTarget: null,
      dailyWordTarget: null,
      dailyCountMode: 'additions',
    })
  })

  test.each([
    { projectWordTarget: 0 },
    { projectWordTarget: -1 },
    { projectWordTarget: 1.5 },
    { dailyWordTarget: 0 },
    { dailyWordTarget: -1 },
    { dailyWordTarget: 1.5 },
    { dailyCountMode: 'unknown' },
    { extra: true },
  ])('rejects_invalid_writing_settings_%j', async (invalid) => {
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Novel' } })
    const { id } = created.json<{ id: string }>()
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}/writing-settings`,
      payload: { projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions', ...invalid },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  test('returns_project_not_found_for_unknown_writing_settings_project', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/projects/11111111-1111-4111-8111-111111111111/writing-settings',
      payload: { projectWordTarget: null, dailyWordTarget: null, dailyCountMode: 'additions' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' })
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
