import type { BinderItemDto, DocumentDto } from '@scr/shared'

import { ApiError } from '../http/errors.js'

export type CompilableDocument = DocumentDto

export function resolveCompileSelection(
  items: BinderItemDto[],
  selectedIds: string[],
  getDocument: (id: string) => DocumentDto | undefined,
): CompilableDocument[] {
  if (selectedIds.length === 0) throw new ApiError(400, 'EMPTY_COMPILE_SELECTION', 'Select at least one document.')
  const selected = new Set(selectedIds)
  if ([...selected].some((id) => !items.some((item) => item.id === id))) {
    throw new ApiError(400, 'INVALID_COMPILE_SELECTION', 'The compile selection is invalid.')
  }
  const included = new Set<string>()
  const selectedFolders = items.filter((item) => selected.has(item.id) && item.kind === 'folder')
  for (const item of items) {
    if (item.kind !== 'document') continue
    if (selected.has(item.id)) included.add(item.id)
    let parentId = item.parentId
    while (parentId) {
      if (selectedFolders.some((folder) => folder.id === parentId)) included.add(item.id)
      parentId = items.find((candidate) => candidate.id === parentId)?.parentId ?? null
    }
  }
  const documents = items
    .filter((item) => item.kind === 'document' && included.has(item.id))
    .map((item) => getDocument(item.id))
    .filter((document): document is DocumentDto => Boolean(document))
  if (documents.length === 0) throw new ApiError(400, 'EMPTY_COMPILE_SELECTION', 'Select at least one document.')
  return documents
}
