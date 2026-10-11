import { randomUUID } from 'node:crypto'

import type {
  BinderItemDto,
  CreateBinderItemRequest,
  MoveBinderItemRequest,
} from '@scr/shared'

import { ApiError } from '../http/errors.js'
import type { ProjectRepository } from '../projects/repository.js'
import type { BinderRepository } from './repository.js'
import {
  hasTrashedAncestor,
  isDescendant,
  partitionBinder,
  type BinderRecord,
} from './tree.js'

function toDto(record: BinderRecord): BinderItemDto {
  return {
    id: record.id,
    projectId: record.projectId,
    parentId: record.parentId,
    kind: record.kind,
    title: record.title,
    position: record.position,
    trashedAt: record.trashedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export interface BinderProjectItems {
  items: BinderItemDto[]
  trashedItems: BinderItemDto[]
}

export interface BinderService {
  listProject(projectId: string): BinderProjectItems
  create(projectId: string, input: CreateBinderItemRequest): BinderItemDto
  rename(itemId: string, title: string): BinderItemDto
  move(input: { itemId: string } & MoveBinderItemRequest): BinderItemDto
  trash(itemId: string): BinderItemDto
  restore(itemId: string): BinderItemDto
  delete(itemId: string): void
}

export function createBinderService(
  repository: BinderRepository,
  projects: ProjectRepository,
  clock: () => Date,
): BinderService {
  const findOrThrow = (id: string): BinderRecord => {
    const item = repository.find(id)
    if (!item) throw new ApiError(404, 'BINDER_ITEM_NOT_FOUND', 'Binder item not found.')
    return item
  }

  const activeOrThrow = (id: string): { item: BinderRecord; records: BinderRecord[] } => {
    const item = findOrThrow(id)
    const records = repository.listByProject(item.projectId)
    if (hasTrashedAncestor(item, records)) {
      throw new ApiError(409, 'BINDER_ITEM_TRASHED', 'Binder item is in Trash.')
    }
    return { item, records }
  }

  const siblings = (
    records: BinderRecord[],
    parentId: string | null,
    excludingId?: string,
  ): BinderRecord[] =>
    records
      .filter(
        (candidate) =>
          candidate.parentId === parentId &&
          candidate.id !== excludingId &&
          !hasTrashedAncestor(candidate, records),
      )
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))

  const renumber = (items: BinderRecord[], now: string): void => {
    items.forEach((item, position) => repository.setLocation(item.id, item.parentId, position, now))
  }

  const validateParent = (
    item: BinderRecord | undefined,
    projectId: string,
    parentId: string | null,
    records: BinderRecord[],
  ): BinderRecord | undefined => {
    if (!parentId) return undefined
    const parent = records.find((candidate) => candidate.id === parentId)
    if (!parent || parent.projectId !== projectId) {
      throw new ApiError(409, 'INVALID_BINDER_PARENT', 'Parent must belong to the same project.')
    }
    if (parent.kind !== 'folder' || hasTrashedAncestor(parent, records)) {
      throw new ApiError(409, 'INVALID_BINDER_PARENT', 'Parent must be an active folder.')
    }
    if (item && (parent.id === item.id || isDescendant(parent.id, item.id, records))) {
      throw new ApiError(409, 'BINDER_CYCLE', 'A folder cannot be moved into itself or its descendant.')
    }
    return parent
  }

  return {
    listProject(projectId) {
      if (!projects.find(projectId)) {
        throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.')
      }
      const partition = partitionBinder(repository.listByProject(projectId))
      return {
        items: partition.active.map(toDto),
        trashedItems: partition.trashed.map(toDto),
      }
    },
    create(projectId, input) {
      if (!projects.find(projectId)) {
        throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.')
      }
      const records = repository.listByProject(projectId)
      validateParent(undefined, projectId, input.parentId, records)
      const now = clock().toISOString()
      const position = siblings(records, input.parentId).length
      return toDto(
        repository.transaction(() =>
          repository.create({
            id: randomUUID(),
            projectId,
            parentId: input.parentId,
            kind: input.kind,
            title: input.title,
            position,
            trashedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      )
    },
    rename(itemId, title) {
      const { item } = activeOrThrow(itemId)
      if (item.kind === 'document') {
        throw new ApiError(409, 'DOCUMENT_RENAME_REQUIRES_SAVE', 'Rename documents through the document save endpoint.')
      }
      return toDto(repository.rename(itemId, title, clock().toISOString()) as BinderRecord)
    },
    move(input) {
      const { item, records } = activeOrThrow(input.itemId)
      validateParent(item, item.projectId, input.parentId, records)
      const destination = siblings(records, input.parentId, item.id)
      if (input.index > destination.length) {
        throw new ApiError(409, 'INVALID_BINDER_INDEX', 'Move index is outside the destination.')
      }
      const sourceParentId = item.parentId
      const now = clock().toISOString()

      return repository.transaction(() => {
        if (sourceParentId !== input.parentId) {
          renumber(siblings(records, sourceParentId, item.id), now)
        }
        const moved = { ...item, parentId: input.parentId }
        destination.splice(input.index, 0, moved)
        renumber(destination, now)
        return toDto(findOrThrow(item.id))
      })
    },
    trash(itemId) {
      const { item, records } = activeOrThrow(itemId)
      const now = clock().toISOString()
      return repository.transaction(() => {
        renumber(siblings(records, item.parentId, item.id), now)
        repository.setTrash(item.id, {
          parentId: null,
          position: item.position,
          trashedAt: now,
          trashedParentId: item.parentId,
          trashedPosition: item.position,
          updatedAt: now,
        })
        return toDto(findOrThrow(item.id))
      })
    },
    restore(itemId) {
      const item = findOrThrow(itemId)
      if (!item.trashedAt) {
        throw new ApiError(409, 'BINDER_ITEM_NOT_TRASHED', 'Only a Trash root can be restored.')
      }
      const records = repository.listByProject(item.projectId)
      const originalParent = item.trashedParentId
        ? records.find((candidate) => candidate.id === item.trashedParentId)
        : undefined
      const parentId =
        originalParent?.kind === 'folder' && !hasTrashedAncestor(originalParent, records)
          ? originalParent.id
          : null
      const destination = siblings(records, parentId, item.id)
      const index = Math.min(item.trashedPosition ?? destination.length, destination.length)
      const now = clock().toISOString()
      return repository.transaction(() => {
        repository.setTrash(item.id, {
          parentId,
          position: index,
          trashedAt: null,
          trashedParentId: null,
          trashedPosition: null,
          updatedAt: now,
        })
        const restored = findOrThrow(item.id)
        destination.splice(index, 0, restored)
        renumber(destination, now)
        return toDto(findOrThrow(item.id))
      })
    },
    delete(itemId) {
      const item = findOrThrow(itemId)
      const records = repository.listByProject(item.projectId)
      if (!hasTrashedAncestor(item, records)) {
        throw new ApiError(409, 'BINDER_ITEM_NOT_TRASHED', 'Move the item to Trash before deleting it.')
      }
      repository.transaction(() => repository.delete(itemId))
    },
  }
}
