import {
  CreateSnapshotRequestSchema,
  RenameSnapshotRequestSchema,
  RestoreSnapshotRequestSchema,
} from '@scr/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { SnapshotService } from './service.js'

const DocumentParamsSchema = z.object({ documentId: z.uuid() })
const SnapshotParamsSchema = z.object({ snapshotId: z.uuid() })

export function registerSnapshotRoutes(app: FastifyInstance, snapshots: SnapshotService): void {
  app.get('/api/documents/:documentId/snapshots', async (request) => {
    const { documentId } = DocumentParamsSchema.parse(request.params)
    return snapshots.list(documentId)
  })

  app.post('/api/documents/:documentId/snapshots', async (request, reply) => {
    const { documentId } = DocumentParamsSchema.parse(request.params)
    const input = CreateSnapshotRequestSchema.parse(request.body)
    return reply.status(201).send(snapshots.create(documentId, input.name))
  })

  app.get('/api/snapshots/:snapshotId', async (request) => {
    const { snapshotId } = SnapshotParamsSchema.parse(request.params)
    return snapshots.get(snapshotId)
  })

  app.patch('/api/snapshots/:snapshotId', async (request) => {
    const { snapshotId } = SnapshotParamsSchema.parse(request.params)
    const input = RenameSnapshotRequestSchema.parse(request.body)
    return snapshots.rename(snapshotId, input.name)
  })

  app.post('/api/snapshots/:snapshotId/restore', async (request) => {
    const { snapshotId } = SnapshotParamsSchema.parse(request.params)
    const input = RestoreSnapshotRequestSchema.parse(request.body)
    return snapshots.restore(snapshotId, input.expectedRevision)
  })

  app.delete('/api/snapshots/:snapshotId', async (request, reply) => {
    const { snapshotId } = SnapshotParamsSchema.parse(request.params)
    snapshots.delete(snapshotId)
    return reply.status(204).send()
  })
}
