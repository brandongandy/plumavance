import Fastify, { type FastifyInstance } from 'fastify'

import { openDatabase } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { ApiError } from './http/errors.js'

export interface CreateAppOptions {
  databasePath: string
  staticRoot?: string
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const database = openDatabase(options.databasePath)
  runMigrations(database)

  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ status: 'ok' as const }))

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      })
    }

    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    })
  })

  app.addHook('onClose', async () => {
    database.close()
  })

  return app
}
