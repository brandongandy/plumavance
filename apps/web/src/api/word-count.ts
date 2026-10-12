import {
  DailyCountModeSchema,
  LocalDateSchema,
  WritingTargetSchema,
  type ProjectDto,
  type RecordWordCountEventRequest,
  type UpdateWritingSettingsRequest,
  type WordCountEventResultDto,
  type WritingProgressDto,
} from '@pluma/shared'
import { z } from 'zod'

import { apiRequest } from './client.js'
import { ProjectSchema } from './projects.js'

const WritingProgressSchema: z.ZodType<WritingProgressDto> = z.object({
  projectWordTarget: WritingTargetSchema,
  dailyWordTarget: WritingTargetSchema,
  dailyCountMode: DailyCountModeSchema,
  projectWordCount: z.number().int().nonnegative(),
  localDate: LocalDateSchema,
  dailyWordCount: z.number().int(),
})
const WordCountEventResultSchema: z.ZodType<WordCountEventResultDto> = z.object({
  localDate: LocalDateSchema,
  dailyWordCount: z.number().int(),
})

export const wordCountApi = {
  getProgress: (projectId: string, localDate: string): Promise<WritingProgressDto> =>
    apiRequest(
      `/api/projects/${projectId}/writing-progress?localDate=${encodeURIComponent(localDate)}`,
      { method: 'GET' },
      WritingProgressSchema.refine((progress) => progress.localDate === localDate),
    ),
  updateSettings: (projectId: string, input: UpdateWritingSettingsRequest): Promise<ProjectDto> =>
    apiRequest(
      `/api/projects/${projectId}/writing-settings`,
      { method: 'PATCH', body: JSON.stringify(input) },
      ProjectSchema,
    ),
  recordEvent: (projectId: string, input: RecordWordCountEventRequest): Promise<WordCountEventResultDto> =>
    apiRequest(
      `/api/projects/${projectId}/word-count-events`,
      { method: 'POST', body: JSON.stringify(input) },
      WordCountEventResultSchema.refine((result) => result.localDate === input.localDate),
    ),
}
