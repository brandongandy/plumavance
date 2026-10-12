import type { RecordWordCountEventRequest, WordCountEventResultDto, WritingProgressDto } from '@pluma/shared'

import { ApiError } from '../http/errors.js'
import type { ProjectRepository } from '../projects/repository.js'
import type { WordCountRepository } from './repository.js'

export interface WordCountService {
  getProgress(projectId: string, localDate: string): WritingProgressDto
  recordEvent(projectId: string, input: RecordWordCountEventRequest): WordCountEventResultDto
}

export function createWordCountService(
  repository: WordCountRepository,
  projects: ProjectRepository,
  clock: () => Date,
): WordCountService {
  const findProject = (projectId: string) => {
    const project = projects.find(projectId)
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.')
    return project
  }

  return {
    getProgress(projectId, localDate) {
      const project = findProject(projectId)
      return {
        projectWordTarget: project.projectWordTarget,
        dailyWordTarget: project.dailyWordTarget,
        dailyCountMode: project.dailyCountMode,
        projectWordCount: repository.projectWordCount(projectId),
        localDate,
        dailyWordCount: repository.dailyWordCount(projectId, localDate),
      }
    },
    recordEvent(projectId, input) {
      findProject(projectId)
      const result = repository.recordEvent({ ...input, projectId, createdAt: clock().toISOString() })
      return { localDate: input.localDate, dailyWordCount: result.dailyWordCount }
    },
  }
}
