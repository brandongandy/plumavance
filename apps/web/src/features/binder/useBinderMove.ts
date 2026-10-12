import type { BinderItemDto } from '@pluma/shared'

import type { MoveItemInput } from '../../api/binder.js'

export function createMoveIntent(
  itemId: string,
  parentId: string | null,
  index: number,
): MoveItemInput {
  return { itemId, parentId, index }
}

export function applyMove(items: BinderItemDto[], intent: MoveItemInput): BinderItemDto[] {
  const moving = items.find((item) => item.id === intent.itemId)
  if (!moving) return items

  const updated = items.map((item) => ({ ...item }))
  const moved = updated.find((item) => item.id === intent.itemId) as BinderItemDto
  const oldParentId = moved.parentId
  moved.parentId = intent.parentId

  const oldSiblings = updated
    .filter((item) => item.parentId === oldParentId && item.id !== moved.id)
    .sort((left, right) => left.position - right.position)
  oldSiblings.forEach((item, index) => {
    item.position = index
  })

  const destination = updated
    .filter((item) => item.parentId === intent.parentId && item.id !== moved.id)
    .sort((left, right) => left.position - right.position)
  destination.splice(Math.min(intent.index, destination.length), 0, moved)
  destination.forEach((item, index) => {
    item.position = index
  })

  const byParent = new Map<string | null, BinderItemDto[]>()
  for (const item of updated) {
    const siblings = byParent.get(item.parentId) ?? []
    siblings.push(item)
    byParent.set(item.parentId, siblings)
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  }

  const ordered: BinderItemDto[] = []
  const visit = (parentId: string | null): void => {
    for (const item of byParent.get(parentId) ?? []) {
      ordered.push(item)
      visit(item.id)
    }
  }
  visit(null)
  return ordered
}

export function useBinderMove(move: (intent: MoveItemInput) => Promise<void>): {
  moveByPointer: (itemId: string, parentId: string | null, index: number) => Promise<void>
  moveByKeyboard: (itemId: string, parentId: string | null, index: number) => Promise<void>
} {
  const run = (itemId: string, parentId: string | null, index: number): Promise<void> =>
    move(createMoveIntent(itemId, parentId, index))
  return { moveByPointer: run, moveByKeyboard: run }
}
