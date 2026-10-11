import { z } from 'zod'

export const ProjectNameSchema = z.string().trim().min(1).max(200)

export const CreateProjectRequestSchema = z.object({
  name: ProjectNameSchema,
})

export const UpdateProjectRequestSchema = z.object({
  name: ProjectNameSchema,
})

export const DeleteProjectRequestSchema = z.object({
  confirmation: z.string(),
})

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>
export type DeleteProjectRequest = z.infer<typeof DeleteProjectRequestSchema>
