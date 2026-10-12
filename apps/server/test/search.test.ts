import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

interface RecordWithId {
  id: string
}

describe('project document search', () => {
  let app: FastifyInstance
  let temporary: TemporaryDatabase

  beforeEach(async () => {
    temporary = await createTemporaryDatabase()
    app = await createApp({ databasePath: temporary.path })
  })

  afterEach(async () => {
    await app.close()
    await temporary.cleanup()
  })

  async function createProject(name: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name } })
    return response.json<RecordWithId>().id
  }

  async function createDocument(projectId: string, title: string, text: string): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/items`,
      payload: { kind: 'document', parentId: null, title },
    })
    const id = created.json<RecordWithId>().id
    await app.inject({
      method: 'PUT',
      url: `/api/documents/${id}`,
      payload: {
        title,
        contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        notesText: '',
        expectedRevision: 0,
      },
    })
    return id
  }

  test('searches_saved_titles_and_text_only_inside_the_active_project_tree', async () => {
    const firstProject = await createProject('First')
    const otherProject = await createProject('Other')
    const titleMatch = await createDocument(firstProject, 'Lantern Chapter', 'A quiet room.')
    const textMatch = await createDocument(firstProject, 'Chapter Two', 'The lantern burned low.')
    const trashedMatch = await createDocument(firstProject, 'Discarded', 'lantern')
    await createDocument(otherProject, 'Lantern Elsewhere', 'lantern')
    await app.inject({ method: 'POST', url: `/api/items/${trashedMatch}/trash` })

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${firstProject}/search?q=lantern`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<Array<{ id: string; title: string; excerpt: string }>>()).toEqual([
      { id: titleMatch, title: 'Lantern Chapter', excerpt: 'A quiet room.' },
      { id: textMatch, title: 'Chapter Two', excerpt: 'The lantern burned low.' },
    ])
  })

  test('search_treats_sql_and_fts_metacharacters_as_literal_text', async () => {
    const projectId = await createProject('Symbols')
    const percent = await createDocument(projectId, 'Percent', 'Progress is 50% complete.')
    const underscore = await createDocument(projectId, 'Underscore', 'snake_case')
    const quote = await createDocument(projectId, 'Quote', 'She said "hello".')
    const phrase = await createDocument(projectId, 'Phrase', 'lantern OR moon')
    await createDocument(projectId, 'Unrelated', 'lantern without the second word')

    const search = async (query: string): Promise<string[]> => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`,
      })
      expect(response.statusCode).toBe(200)
      return response.json<Array<{ id: string }>>().map((result) => result.id)
    }

    expect(await search('%')).toEqual([percent])
    expect(await search('_')).toEqual([underscore])
    expect(await search('"')).toEqual([quote])
    expect(await search('lantern OR moon')).toEqual([phrase])
  })

  test('search_limits_results', async () => {
    const projectId = await createProject('Large')
    for (let index = 0; index < 101; index += 1) {
      await createDocument(projectId, `Match ${index}`, 'common searchable phrase')
    }

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/search?q=searchable`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<unknown[]>()).toHaveLength(100)
  })
})
