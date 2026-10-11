import { createReadStream } from 'node:fs'

import { CompileRequestSchema } from '@scr/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { CompileService } from './service.js'

const ParamsSchema = z.object({ projectId: z.uuid() })

export function registerCompileRoutes(app: FastifyInstance, compile: CompileService): void {
  app.post('/api/projects/:projectId/compile', async (request, reply) => {
    const { projectId } = ParamsSchema.parse(request.params)
    const input = CompileRequestSchema.parse(request.body)
    const artifact = await compile.compile(projectId, input)
    const stream = createReadStream(artifact.path)
    let disposed = false
    const dispose = async (): Promise<void> => {
      if (disposed) return
      disposed = true
      await artifact.dispose()
    }
    stream.once('close', () => { void dispose() })
    stream.once('error', () => { void dispose() })
    reply.raw.once('close', () => { void dispose() })
    reply.header('content-type', artifact.mediaType)
    reply.header('content-disposition', `attachment; filename="${artifact.filename.replace(/["\\]/g, '')}"`)
    return reply.send(stream)
  })
}
