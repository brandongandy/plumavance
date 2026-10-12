import { LocalDateSchema, RecordWordCountEventRequestSchema } from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { WordCountService } from './service.js'

const ProjectParamsSchema = z.object({ projectId: z.uuid() })
const ProgressQuerySchema = z.object({ localDate: LocalDateSchema })

export function registerWordCountRoutes(app: FastifyInstance, wordCounts: WordCountService): void {
  app.get('/api/projects/:projectId/writing-progress', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const { localDate } = ProgressQuerySchema.parse(request.query)
    return wordCounts.getProgress(projectId, localDate)
  })

  app.post('/api/projects/:projectId/word-count-events', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const input = RecordWordCountEventRequestSchema.parse(request.body)
    return wordCounts.recordEvent(projectId, input)
  })
}
