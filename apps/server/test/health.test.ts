import { afterEach, describe, expect, test, vi } from 'vitest'
import { Writable } from 'node:stream'

import { createApp } from '../src/app.js'
import { createTemporaryDatabase, type TemporaryDatabase } from './helpers/database.js'

describe('health boundary', () => {
  let temporary: TemporaryDatabase | undefined

  afterEach(async () => {
    await temporary?.cleanup()
  })

  test('returns_health_after_migrating_a_new_database', async () => {
    temporary = await createTemporaryDatabase()
    const app = await createApp({ databasePath: temporary.path })

    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  test('logs_only_unexpected_errors_with_a_generic_response', async () => {
    temporary = await createTemporaryDatabase()
    const app = await createApp({ databasePath: temporary.path })
    const failure = new Error('private manuscript failure')
    app.get('/api/test/unexpected', async () => {
      throw failure
    })
    const errorLog = vi.spyOn(app.log, 'error')

    const unexpected = await app.inject({ method: 'GET', url: '/api/test/unexpected' })
    expect(unexpected.statusCode).toBe(500)
    expect(unexpected.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    })
    expect(errorLog).toHaveBeenCalledTimes(1)
    expect(errorLog).toHaveBeenCalledWith({ err: failure }, 'Unexpected request failure.')

    await app.inject({ method: 'GET', url: '/api/projects/not-a-uuid' })
    await app.inject({
      method: 'GET',
      url: '/api/projects/11111111-1111-4111-8111-111111111111',
    })
    expect(errorLog).toHaveBeenCalledTimes(1)
    await app.close()
  })

  test('production_request_logs_omit_search_query_values', async () => {
    temporary = await createTemporaryDatabase()
    let output = ''
    const loggerStream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString()
        callback()
      },
    })
    const app = await createApp({
      databasePath: temporary.path,
      logger: true,
      loggerStream,
    })
    const secret = 'PRIVATE_MANUSCRIPT_PHRASE'

    await app.inject({
      method: 'GET',
      url: `/api/projects/11111111-1111-4111-8111-111111111111/search?q=${secret}`,
    })

    expect(output).toContain('/api/projects/11111111-1111-4111-8111-111111111111/search')
    expect(output).not.toContain(secret)
    await app.close()
  })
})
