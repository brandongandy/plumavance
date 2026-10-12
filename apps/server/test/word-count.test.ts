import { randomUUID } from 'node:crypto'

import type { BinderItemDto, ProjectDto, WordCountEventResultDto, WritingProgressDto } from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('word-count routes', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase
  let projectId: string

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    app = await createApp({ databasePath: temporary.path })
    projectId = await createProject('Novel')
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  async function createProject(name: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name } })
    expect(response.statusCode).toBe(201)
    return response.json<ProjectDto>().id
  }

  async function createItem(
    kind: 'folder' | 'document',
    parentId: string | null = null,
    itemProjectId = projectId,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${itemProjectId}/items`,
      payload: { kind, parentId, title: 'Title words never count' },
    })
    expect(response.statusCode).toBe(201)
    return response.json<BinderItemDto>().id
  }

  async function saveBody(documentId: string, text: string): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      payload: {
        title: 'Title words never count',
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
        notesText: 'Notes words never count either',
        expectedRevision: 0,
      },
    })
    expect(response.statusCode).toBe(200)
  }

  async function getProgress(localDate = '2026-10-12', id = projectId): Promise<WritingProgressDto> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${id}/writing-progress?localDate=${localDate}`,
    })
    expect(response.statusCode).toBe(200)
    return response.json<WritingProgressDto>()
  }

  async function postEvent(
    delta: number,
    eventId = randomUUID(),
    localDate = '2026-10-12',
    id = projectId,
  ): Promise<WordCountEventResultDto> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/word-count-events`,
      payload: { eventId, localDate, delta },
    })
    expect(response.statusCode).toBe(200)
    return response.json<WordCountEventResultDto>()
  }

  test('reports_saved_project_words_without_trashed_documents_or_trashed_descendants', async () => {
    // Catches title/notes counting, project leakage, and direct-only Trash filtering.
    const root = await createItem('document')
    const activeFolder = await createItem('folder')
    const activeNested = await createItem('document', activeFolder)
    await saveBody(root, 'One two three four five')
    await saveBody(activeNested, 'Six\u2003seven\u00a0eight nine ten eleven twelve')

    const trashedDocument = await createItem('document')
    await saveBody(trashedDocument, 'Excluded direct document')
    expect((await app.inject({ method: 'POST', url: `/api/items/${trashedDocument}/trash` })).statusCode).toBe(200)

    const trashedFolder = await createItem('folder')
    const childDocument = await createItem('document', trashedFolder)
    const childFolder = await createItem('folder', trashedFolder)
    const grandchildDocument = await createItem('document', childFolder)
    await saveBody(childDocument, 'Excluded child document')
    await saveBody(grandchildDocument, 'Excluded grandchild document')
    expect((await app.inject({ method: 'POST', url: `/api/items/${trashedFolder}/trash` })).statusCode).toBe(200)

    const otherProject = await createProject('Other')
    await saveBody(await createItem('document', null, otherProject), 'Other project body')
    const settings = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/writing-settings`,
      payload: { projectWordTarget: 80000, dailyWordTarget: 500, dailyCountMode: 'net' },
    })
    expect(settings.statusCode).toBe(200)

    const progress = await getProgress()
    expect(progress).toMatchObject({
      projectWordCount: 12,
      localDate: '2026-10-12',
      dailyWordCount: 0,
      projectWordTarget: 80000,
      dailyWordTarget: 500,
      dailyCountMode: 'net',
    })
    const emptyProject = await createProject('Empty')
    expect(await getProgress('2026-10-12', emptyProject)).toMatchObject({
      projectWordCount: 0,
      projectWordTarget: null,
      dailyWordTarget: null,
      dailyCountMode: 'additions',
    })
  })

  test('records_signed_daily_deltas_once_per_event_id_and_isolates_project_and_date', async () => {
    // Catches double application, clamped negatives, and unscoped SUM queries.
    const eventId = randomUUID()
    const firstPost = await postEvent(25, eventId)
    expect(firstPost).toMatchObject({ localDate: '2026-10-12', dailyWordCount: 25 })
    const sameIdRetry = await postEvent(25, eventId)
    expect(sameIdRetry.dailyWordCount).toBe(25)
    const negativeEvent = await postEvent(-30)
    expect(negativeEvent.dailyWordCount).toBe(-5)
    expect((await postEvent(999, eventId)).dailyWordCount).toBe(-5)
    expect((await postEvent(0)).dailyWordCount).toBe(-5)

    expect(await postEvent(7, randomUUID(), '2026-10-13')).toEqual({ localDate: '2026-10-13', dailyWordCount: 7 })
    const otherProject = await createProject('Other')
    expect((await postEvent(40, randomUUID(), '2026-10-12', otherProject)).dailyWordCount).toBe(40)
    expect(await getProgress()).toMatchObject({ localDate: '2026-10-12', dailyWordCount: -5 })
    expect(await getProgress('2026-10-13')).toMatchObject({ dailyWordCount: 7 })
    expect(await getProgress('2026-10-14')).toMatchObject({ dailyWordCount: 0 })
    expect(await getProgress('2026-10-12', otherProject)).toMatchObject({ dailyWordCount: 40 })

    await app.close()
    app = await createApp({ databasePath: temporary.path })
    expect((await postEvent(25, eventId)).dailyWordCount).toBe(-5)
    expect(await getProgress()).toMatchObject({ dailyWordCount: -5 })
  })

  test('rejects_invalid_dates_events_and_missing_projects', async () => {
    // Catches absent route validation and writes to missing projects.
    for (const query of ['', '?localDate=2026-2-3', '?localDate=2026-02-30', '?localDate=2026-13-01']) {
      const response = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/writing-progress${query}` })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
    const validEvent = { eventId: randomUUID(), localDate: '2026-10-12', delta: 3 }
    for (const payload of [
      { ...validEvent, eventId: 'invalid' },
      { ...validEvent, localDate: '2026-02-30' },
      { ...validEvent, delta: 1.5 },
      { ...validEvent, delta: '3' },
      { eventId: validEvent.eventId, localDate: validEvent.localDate },
      { ...validEvent, projectId },
    ]) {
      const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/word-count-events`, payload })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    }
    const missingProject = randomUUID()
    for (const response of [
      await app.inject({ method: 'GET', url: `/api/projects/${missingProject}/writing-progress?localDate=2026-10-12` }),
      await app.inject({ method: 'POST', url: `/api/projects/${missingProject}/word-count-events`, payload: validEvent }),
    ]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    }
    for (const response of [
      await app.inject({ method: 'GET', url: '/api/projects/invalid/writing-progress?localDate=2026-10-12' }),
      await app.inject({ method: 'POST', url: '/api/projects/invalid/word-count-events', payload: validEvent }),
    ]) {
      expect(response.statusCode).toBe(400)
    }
    expect(await getProgress()).toMatchObject({ dailyWordCount: 0 })
  })
})
