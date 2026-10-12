import { SaveDocumentRequestSchema, SearchQuerySchema } from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { DocumentService } from './service.js'

const DocumentParamsSchema = z.object({ documentId: z.uuid() })
const ProjectParamsSchema = z.object({ projectId: z.uuid() })
const SearchParamsSchema = z.object({ q: SearchQuerySchema })

export function registerDocumentRoutes(app: FastifyInstance, documents: DocumentService): void {
  app.get('/api/documents/:documentId', async (request) => {
    const { documentId } = DocumentParamsSchema.parse(request.params)
    return documents.get(documentId)
  })

  app.put('/api/documents/:documentId', async (request) => {
    const { documentId } = DocumentParamsSchema.parse(request.params)
    const input = SaveDocumentRequestSchema.parse(request.body)
    return documents.save(documentId, input)
  })

  app.get('/api/projects/:projectId/search', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const { q } = SearchParamsSchema.parse(request.query)
    return documents.search(projectId, q)
  })
}
