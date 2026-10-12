import { createReadStream } from 'node:fs'

import { CompileRequestSchema, CompileWordCountRequestSchema } from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { CompileService } from './service.js'

const ParamsSchema = z.object({ projectId: z.uuid() })

export function contentDisposition(filename: string): string {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\;]/g, '')
    .trim()
  const extension = filename.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
  const fallback = ascii && ascii !== extension ? ascii : `export${extension}`
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export function registerCompileRoutes(app: FastifyInstance, compile: CompileService): void {
  app.post('/api/projects/:projectId/compile/word-count', async (request) => {
    const { projectId } = ParamsSchema.parse(request.params)
    const { itemIds } = CompileWordCountRequestSchema.parse(request.body)
    return { wordCount: compile.countWords(projectId, itemIds) }
  })

  app.post('/api/projects/:projectId/compile', async (request, reply) => {
    const { projectId } = ParamsSchema.parse(request.params)
    const input = CompileRequestSchema.parse(request.body)
    const controller = new AbortController()
    const abort = (): void => controller.abort(new Error('Client disconnected.'))
    const abortClosedReply = (): void => {
      if (!reply.raw.writableEnded) abort()
    }
    request.raw.once('aborted', abort)
    reply.raw.once('close', abortClosedReply)
    const artifact = await compile.compile(projectId, input, controller.signal)
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
    reply.header('content-disposition', contentDisposition(artifact.filename))
    return reply.send(stream)
  })
}
