import { z } from 'zod'

function isRealCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const DailyCountModeSchema = z.enum(['additions', 'net'])
export const WritingTargetSchema = z.number().int().positive().nullable()
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealCalendarDate)
export const UpdateWritingSettingsRequestSchema = z.object({
  projectWordTarget: WritingTargetSchema,
  dailyWordTarget: WritingTargetSchema,
  dailyCountMode: DailyCountModeSchema,
}).strict()
export const RecordWordCountEventRequestSchema = z.object({
  eventId: z.uuid(),
  localDate: LocalDateSchema,
  delta: z.number().int(),
}).strict()

export type UpdateWritingSettingsRequest = z.infer<typeof UpdateWritingSettingsRequestSchema>
export type RecordWordCountEventRequest = z.infer<typeof RecordWordCountEventRequestSchema>
