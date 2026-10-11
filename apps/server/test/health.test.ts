import { afterEach, describe, expect, test } from 'vitest'

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
})
