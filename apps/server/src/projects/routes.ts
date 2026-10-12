import {
  CreateProjectRequestSchema,
  DeleteProjectRequestSchema,
  UpdateProjectRequestSchema,
  UpdateWritingSettingsRequestSchema,
} from '@pluma/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { BinderService } from '../binder/service.js'
import type { ProjectService } from './service.js'

const ProjectParamsSchema = z.object({ projectId: z.uuid() })

export function registerProjectRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  binder: BinderService,
): void {
  app.get('/api/projects', async () => projects.list())

  app.post('/api/projects', async (request, reply) => {
    const input = CreateProjectRequestSchema.parse(request.body)
    return reply.status(201).send(projects.create(input.name))
  })

  app.get('/api/projects/:projectId', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const project = projects.open(projectId)
    return { project, ...binder.listProject(projectId) }
  })

  app.patch('/api/projects/:projectId', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const input = UpdateProjectRequestSchema.parse(request.body)
    return projects.rename(projectId, input.name)
  })

  app.delete('/api/projects/:projectId', async (request, reply) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const input = DeleteProjectRequestSchema.parse(request.body)
    projects.delete(projectId, input.confirmation)
    return reply.status(204).send()
  })

  app.patch('/api/projects/:projectId/writing-settings', async (request) => {
    const { projectId } = ProjectParamsSchema.parse(request.params)
    const input = UpdateWritingSettingsRequestSchema.parse(request.body)
    return projects.updateWritingSettings(projectId, input)
  })
}
