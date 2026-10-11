import { z } from 'zod'

export const BinderTitleSchema = z.string().trim().min(1).max(300)

export const CreateBinderItemRequestSchema = z.object({
  kind: z.enum(['folder', 'document']),
  parentId: z.uuid().nullable(),
  title: BinderTitleSchema,
})

export const RenameBinderItemRequestSchema = z.object({
  title: BinderTitleSchema,
})

export const MoveBinderItemRequestSchema = z.object({
  parentId: z.uuid().nullable(),
  index: z.number().int().min(0),
})

export type CreateBinderItemRequest = z.infer<typeof CreateBinderItemRequestSchema>
export type RenameBinderItemRequest = z.infer<typeof RenameBinderItemRequestSchema>
export type MoveBinderItemRequest = z.infer<typeof MoveBinderItemRequestSchema>
