import { z } from 'zod'

export const CompileExportTypeSchema = z.enum(['manuscript', 'ereader'])
export const CompileFormatSchema = z.enum(['pdf', 'rtf', 'markdown', 'epub'])
export const EreaderFontSchema = z.enum(['monospace', 'serif', 'sans-serif'])
export const PaperbackPageSizeSchema = z.enum(['mass-market', 'digest', 'trade'])

export const CompileWordCountRequestSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
}).strict()

export const CompileWordCountResponseSchema = z.object({
  wordCount: z.number().int().nonnegative(),
})

const CompileRequestBaseSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
  includeTitles: z.boolean(),
  includeFolderTitles: z.boolean().default(true),
  sceneSeparator: z.string().max(20),
  chapterPageBreaks: z.boolean(),
  filename: z.string().trim().min(1).max(200),
})

export const CompileRequestSchema = z.discriminatedUnion('exportType', [
  CompileRequestBaseSchema.extend({
    exportType: z.literal('manuscript'),
    format: z.enum(['pdf', 'rtf', 'markdown']),
  }).strict(),
  CompileRequestBaseSchema.extend({
    exportType: z.literal('ereader'),
    format: z.enum(['pdf', 'epub']),
    font: EreaderFontSchema,
    pageSize: PaperbackPageSizeSchema.optional(),
  }).strict(),
])

export type CompileExportType = z.infer<typeof CompileExportTypeSchema>
export type CompileFormat = z.infer<typeof CompileFormatSchema>
export type EreaderFont = z.infer<typeof EreaderFontSchema>
export type PaperbackPageSize = z.infer<typeof PaperbackPageSizeSchema>
export type CompileRequest = z.infer<typeof CompileRequestSchema>
export type CompileWordCountResponse = z.infer<typeof CompileWordCountResponseSchema>
