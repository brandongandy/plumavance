import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { createBinderRepository } from './binder/repository.js'
import { registerBinderRoutes } from './binder/routes.js'
import { createBinderService } from './binder/service.js'
import { createLocalConverters, type ConverterSet } from './compile/converters.js'
import { registerCompileRoutes } from './compile/routes.js'
import { createCompileService } from './compile/service.js'
import { openDatabase } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { createDocumentRepository } from './documents/repository.js'
import { registerDocumentRoutes } from './documents/routes.js'
import { createDocumentService } from './documents/service.js'
import { ApiError } from './http/errors.js'
import { createProjectRepository } from './projects/repository.js'
import { registerProjectRoutes } from './projects/routes.js'
import { createProjectService } from './projects/service.js'
import { createSnapshotRepository } from './snapshots/repository.js'
import { registerSnapshotRoutes } from './snapshots/routes.js'
import { createSnapshotService } from './snapshots/service.js'

export interface CreateAppOptions {
  databasePath: string
  staticRoot?: string
  clock?: () => Date
  converters?: ConverterSet
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const database = openDatabase(options.databasePath)
  runMigrations(database)
  const clock = options.clock ?? (() => new Date())
  const projectRepository = createProjectRepository(database)
  const binderRepository = createBinderRepository(database)
  const projectService = createProjectService(projectRepository, clock)
  const binderService = createBinderService(binderRepository, projectRepository, clock)
  const documentRepository = createDocumentRepository(database)
  const documentService = createDocumentService(
    documentRepository,
    projectRepository,
    binderService,
    clock,
  )
  const snapshotRepository = createSnapshotRepository(database)
  const snapshotService = createSnapshotService(snapshotRepository, documentRepository, clock)
  const compileService = createCompileService(
    binderService,
    documentRepository,
    options.converters ?? createLocalConverters(),
  )

  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ status: 'ok' as const }))
  registerProjectRoutes(app, projectService, binderService)
  registerBinderRoutes(app, binderService)
  registerDocumentRoutes(app, documentService)
  registerSnapshotRoutes(app, snapshotService)
  registerCompileRoutes(app, compileService)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      })
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
        details: error.issues,
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
