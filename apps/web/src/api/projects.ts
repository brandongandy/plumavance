import { DailyCountModeSchema, WritingTargetSchema, type ProjectDto } from '@pluma/shared'
import { z } from 'zod'

import { apiRequest, apiRequestEmpty } from './client.js'

export const ProjectSchema: z.ZodType<ProjectDto> = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string(),
  projectWordTarget: WritingTargetSchema,
  dailyWordTarget: WritingTargetSchema,
  dailyCountMode: DailyCountModeSchema,
})
const ProjectListSchema = z.array(ProjectSchema)

export const projectApi = {
  list: (): Promise<ProjectDto[]> => apiRequest('/api/projects', { method: 'GET' }, ProjectListSchema),
  create: (name: string): Promise<ProjectDto> =>
    apiRequest('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }, ProjectSchema),
  rename: (id: string, name: string): Promise<ProjectDto> =>
    apiRequest(
      `/api/projects/${id}`,
      { method: 'PATCH', body: JSON.stringify({ name }) },
      ProjectSchema,
    ),
  delete: (id: string, confirmation: string): Promise<void> =>
    apiRequestEmpty(`/api/projects/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
}
