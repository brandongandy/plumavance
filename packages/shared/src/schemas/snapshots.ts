import { z } from 'zod'

export const SnapshotNameSchema = z.string().max(200).optional()

export const CreateSnapshotRequestSchema = z.object({
  name: SnapshotNameSchema,
})

export const RenameSnapshotRequestSchema = z.object({
  name: z.string().max(200),
})

export const RestoreSnapshotRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
})

export type CreateSnapshotRequest = z.infer<typeof CreateSnapshotRequestSchema>
export type RenameSnapshotRequest = z.infer<typeof RenameSnapshotRequestSchema>
export type RestoreSnapshotRequest = z.infer<typeof RestoreSnapshotRequestSchema>
