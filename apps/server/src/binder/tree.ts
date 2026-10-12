import type { BinderItemDto } from '@pluma/shared'

export interface BinderRecord extends BinderItemDto {
  trashedParentId: string | null
  trashedPosition: number | null
}

export function collectTrashedIds(records: BinderRecord[]): Set<string> {
  const byId = new Map(records.map((record) => [record.id, record]))
  const memo = new Map<string, boolean>()

  for (const record of records) {
    if (memo.has(record.id)) continue

    const path: BinderRecord[] = []
    const visited = new Set<string>()
    let current: BinderRecord | undefined = record
    let isTrashed = false

    while (current) {
      const cached = memo.get(current.id)
      if (cached !== undefined) {
        isTrashed = cached
        break
      }
      if (current.trashedAt) {
        isTrashed = true
        path.push(current)
        break
      }
      if (visited.has(current.id)) break

      visited.add(current.id)
      path.push(current)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }

    for (const item of path) memo.set(item.id, isTrashed)
  }

  return new Set(records.filter((record) => memo.get(record.id)).map((record) => record.id))
}

export function hasTrashedAncestor(item: BinderRecord, records: BinderRecord[]): boolean {
  return collectTrashedIds(records).has(item.id)
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
  const trashedIds = collectTrashedIds(records)
  const activeRecords = records.filter((record) => !trashedIds.has(record.id))
  const trashedRecords = records.filter((record) => trashedIds.has(record.id))
  const activeRoots = activeRecords.filter((record) => !record.parentId)
  const trashedRoots = trashedRecords.filter(
    (record) => !record.parentId || !trashedIds.has(record.parentId),
  )
  return {
    active: flattenBinder(activeRecords, activeRoots),
    trashed: flattenBinder(trashedRecords, trashedRoots),
  }
}
