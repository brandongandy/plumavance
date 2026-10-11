import {
  CreateBinderItemRequestSchema,
  MoveBinderItemRequestSchema,
  RenameBinderItemRequestSchema,
} from '@scr/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { BinderService } from './service.js'

const ProjectParamsSchema = z.object({ projectId: z.uuid() })
const ItemParamsSchema = z.object({ itemId: z.uuid() })

export function registerBinderRoutes(app: FastifyInstance, binder: BinderService): void {
  app.post('/api/projects/:projectId/items', async (request, reply) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const input = CreateBinderItemRequestSchema.parse(request.body)
    return reply.status(201).send(binder.create(projectId, input))
  })

  app.patch('/api/items/:itemId', async (request) => {
    const { itemId } = ItemParamsSchema.parse(request.params)
    const input = RenameBinderItemRequestSchema.parse(request.body)
    return binder.rename(itemId, input.title)
  })

  app.post('/api/items/:itemId/move', async (request) => {
    const { itemId } = ItemParamsSchema.parse(request.params)
    const input = MoveBinderItemRequestSchema.parse(request.body)
    return binder.move({ itemId, ...input })
  })

  app.post('/api/items/:itemId/trash', async (request) => {
    const { itemId } = ItemParamsSchema.parse(request.params)
    return binder.trash(itemId)
  })

  app.post('/api/items/:itemId/restore', async (request) => {
    const { itemId } = ItemParamsSchema.parse(request.params)
    return binder.restore(itemId)
  })

  app.delete('/api/items/:itemId', async (request, reply) => {
    const { itemId } = ItemParamsSchema.parse(request.params)
    binder.delete(itemId)
    return reply.status(204).send()
  })
}
