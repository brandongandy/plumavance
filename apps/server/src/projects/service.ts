import { randomUUID } from 'node:crypto'

import type { ProjectDto, UpdateWritingSettingsRequest } from '@pluma/shared'

import { ApiError } from '../http/errors.js'
import type { ProjectRepository } from './repository.js'

export interface ProjectService {
  list(): ProjectDto[]
  create(name: string): ProjectDto
  get(id: string): ProjectDto
  open(id: string): ProjectDto
  rename(id: string, name: string): ProjectDto
  updateWritingSettings(id: string, input: UpdateWritingSettingsRequest): ProjectDto
  delete(id: string, confirmation: string): void
}

export function createProjectService(
  repository: ProjectRepository,
  clock: () => Date,
): ProjectService {
  const findOrThrow = (id: string): ProjectDto => {
    const project = repository.find(id)
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.')
    return project
  }

  return {
    list: () => repository.list(),
    create(name) {
      const now = clock().toISOString()
      return repository.create({
        id: randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        projectWordTarget: null,
        dailyWordTarget: null,
        dailyCountMode: 'additions',
      })
    },
    get: findOrThrow,
    open(id) {
      findOrThrow(id)
      return repository.touch(id, clock().toISOString()) as ProjectDto
    },
    rename(id, name) {
      findOrThrow(id)
      return repository.rename(id, name, clock().toISOString()) as ProjectDto
    },
    updateWritingSettings(id, input) {
      findOrThrow(id)
      return repository.updateWritingSettings(id, input, clock().toISOString()) as ProjectDto
    },
    delete(id, confirmation) {
      const project = findOrThrow(id)
      if (confirmation !== project.name) {
        throw new ApiError(409, 'PROJECT_CONFIRMATION_MISMATCH', 'Project name does not match.')
      }
      repository.delete(id)
    },
  }
}
