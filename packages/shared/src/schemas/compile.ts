import { z } from 'zod'

export const CompileFormatSchema = z.enum(['pdf', 'rtf', 'markdown'])
export const CompileRequestSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
  format: CompileFormatSchema,
  includeTitles: z.boolean(),
  separateDocuments: z.boolean(),
  filename: z.string().trim().min(1).max(200),
})

export type CompileFormat = z.infer<typeof CompileFormatSchema>
export type CompileRequest = z.infer<typeof CompileRequestSchema>
