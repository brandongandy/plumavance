import type {
  DocumentDto,
  SaveDocumentRequest,
  SearchResultDto,
} from '@scr/shared'

import type { BinderService } from '../binder/service.js'
import { ApiError } from '../http/errors.js'
import type { ProjectRepository } from '../projects/repository.js'
import { extractDocumentText } from './editor-json.js'
import type { DocumentRepository } from './repository.js'

export interface DocumentService {
  get(documentId: string): DocumentDto
  save(documentId: string, input: SaveDocumentRequest): DocumentDto
  search(projectId: string, query: string): SearchResultDto[]
}

export function createDocumentService(
  repository: DocumentRepository,
  projects: ProjectRepository,
  binder: BinderService,
  clock: () => Date,
): DocumentService {
  const get = (documentId: string): DocumentDto => {
    const document = repository.find(documentId)
    if (!document) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
    return document
  }

  const conflict = (current: DocumentDto): never => {
    throw new ApiError(409, 'DOCUMENT_CONFLICT', 'The document changed in another tab.', {
      currentRevision: current.revision,
      savedAt: current.savedAt,
    })
  }

  return {
    get,
    save(documentId, input) {
      const current = get(documentId)
      if (current.revision !== input.expectedRevision) conflict(current)
      const saved = repository.transaction(() =>
        repository.save({
          documentId,
          title: input.title,
          contentJson: input.contentJson,
          contentText: extractDocumentText(input.contentJson),
          notesText: input.notesText,
          expectedRevision: input.expectedRevision,
          savedAt: clock().toISOString(),
        }),
      )
      return saved ?? conflict(get(documentId))
    },
    search(projectId, query) {
      if (!projects.find(projectId)) {
        throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.')
      }
      const order = new Map(
        binder.listProject(projectId).items.map((item, index) => [item.id, index]),
      )
      return repository
        .search(projectId, query)
        .sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity))
    },
  }
}
