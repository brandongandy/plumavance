import type { BinderItemDto, DocumentDto } from '@pluma/shared'

import { ApiError } from '../http/errors.js'

export interface CompilableFolder {
  kind: 'folder'
  id: string
  parentId: string | null
  title: string
  headingLevel: number
}

export interface CompilableDocument {
  kind: 'document'
  id: string
  parentId: string | null
  document: DocumentDto
  headingLevel: number
}

export type CompilableEntry = CompilableFolder | CompilableDocument

function collectIncludedIds(
  items: BinderItemDto[],
  selectedIds: string[],
): Set<string> {
  if (selectedIds.length === 0) throw new ApiError(400, 'EMPTY_COMPILE_SELECTION', 'Select at least one document.')
  const selected = new Set(selectedIds)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  if ([...selected].some((id) => !itemsById.has(id))) {
    throw new ApiError(400, 'INVALID_COMPILE_SELECTION', 'The compile selection is invalid.')
  }
  const included = new Set(selected)
  const selectedFolders = new Set(items.filter((item) => selected.has(item.id) && item.kind === 'folder').map((item) => item.id))
  for (const item of items) {
    let parentId = item.parentId
    while (parentId) {
      if (selectedFolders.has(parentId)) {
        included.add(item.id)
        break
      }
      parentId = itemsById.get(parentId)?.parentId ?? null
    }
  }
  return included
}

export function resolveCompileDocumentIds(
  items: BinderItemDto[],
  selectedIds: string[],
): string[] {
  const included = collectIncludedIds(items, selectedIds)
  return items
    .filter((item) => included.has(item.id) && item.kind === 'document')
    .map((item) => item.id)
}

export function resolveCompileSelection(
  items: BinderItemDto[],
  selectedIds: string[],
  documentsById: ReadonlyMap<string, DocumentDto>,
): CompilableEntry[] {
  const included = collectIncludedIds(items, selectedIds)
  const itemsById = new Map(items.map((item) => [item.id, item]))

  const headingLevel = (item: BinderItemDto): number => {
    let level = 1
    let parentId = item.parentId
    while (parentId) {
      const parent = itemsById.get(parentId)
      if (!parent) break
      if (parent.kind === 'folder' && included.has(parent.id)) level += 1
      parentId = parent.parentId
    }
    return Math.min(level, 6)
  }

  const entries = items.flatMap<CompilableEntry>((item) => {
    if (!included.has(item.id)) return []
    if (item.kind === 'folder') {
      return [{ kind: 'folder', id: item.id, parentId: item.parentId, title: item.title, headingLevel: headingLevel(item) }]
    }
    const document = documentsById.get(item.id)
    if (!document) {
      throw new ApiError(
        500,
        'DOCUMENT_DATA_MISSING',
        `Selected document data is missing for binder item ${item.id}.`,
      )
    }
    return [{ kind: 'document', id: item.id, parentId: item.parentId, document, headingLevel: headingLevel(item) }]
  })
  if (!entries.some((entry) => entry.kind === 'document')) {
    throw new ApiError(400, 'EMPTY_COMPILE_SELECTION', 'Select at least one document.')
  }
  return entries
}
