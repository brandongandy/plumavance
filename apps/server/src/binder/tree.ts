import type { BinderItemDto } from '@scr/shared'

export interface BinderRecord extends BinderItemDto {
  trashedParentId: string | null
  trashedPosition: number | null
}

export function hasTrashedAncestor(item: BinderRecord, records: BinderRecord[]): boolean {
  const byId = new Map(records.map((record) => [record.id, record]))
  const visited = new Set<string>()
  let current: BinderRecord | undefined = item

  while (current) {
    if (current.trashedAt) return true
    if (!current.parentId || visited.has(current.parentId)) return false
    visited.add(current.parentId)
    current = byId.get(current.parentId)
  }

  return false
}

export function isDescendant(
  possibleDescendantId: string,
  ancestorId: string,
  records: BinderRecord[],
): boolean {
  const byId = new Map(records.map((record) => [record.id, record]))
  const visited = new Set<string>()
  let current = byId.get(possibleDescendantId)

  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    if (visited.has(current.parentId)) return false
    visited.add(current.parentId)
    current = byId.get(current.parentId)
  }

  return false
}

export function flattenBinder(records: BinderRecord[], roots: BinderRecord[]): BinderRecord[] {
  const children = new Map<string, BinderRecord[]>()
  for (const record of records) {
    if (!record.parentId) continue
    const siblings = children.get(record.parentId) ?? []
    siblings.push(record)
    children.set(record.parentId, siblings)
  }

  const sort = (items: BinderRecord[]): BinderRecord[] =>
    [...items].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))

  const flattened: BinderRecord[] = []
  const visit = (item: BinderRecord): void => {
    flattened.push(item)
    for (const child of sort(children.get(item.id) ?? [])) visit(child)
  }
  for (const root of sort(roots)) visit(root)
  return flattened
}

export function partitionBinder(records: BinderRecord[]): {
  active: BinderRecord[]
  trashed: BinderRecord[]
} {
  const activeSet = new Set(records.filter((record) => !hasTrashedAncestor(record, records)).map((item) => item.id))
  const activeRecords = records.filter((record) => activeSet.has(record.id))
  const trashedRecords = records.filter((record) => !activeSet.has(record.id))
  const activeRoots = activeRecords.filter((record) => !record.parentId)
  const trashedRoots = trashedRecords.filter(
    (record) => !record.parentId || !trashedRecords.some((candidate) => candidate.id === record.parentId),
  )
  return {
    active: flattenBinder(activeRecords, activeRoots),
    trashed: flattenBinder(trashedRecords, trashedRoots),
  }
}
