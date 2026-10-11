import type { BinderItemDto, DocumentDto } from '@scr/shared'
import { describe, expect, test } from 'vitest'

import { resolveCompileSelection } from '../src/compile/selection.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-10-10T00:00:00.000Z'
const binder = (id: string, kind: 'folder' | 'document', parentId: string | null, position: number): BinderItemDto => ({ id, projectId, parentId, kind, title: id, position, trashedAt: null, createdAt: stamp, updatedAt: stamp })
const folder = binder('22222222-2222-4222-8222-222222222222', 'folder', null, 0)
const first = binder('33333333-3333-4333-8333-333333333333', 'document', folder.id, 0)
const second = binder('44444444-4444-4444-8444-444444444444', 'document', null, 1)
const doc = (item: BinderItemDto): DocumentDto => ({ id: item.id, projectId, title: item.id, contentJson: { type: 'doc', content: [{ type: 'paragraph' }] }, contentText: '', notesText: '', revision: 0, savedAt: stamp })

describe('compile selection', () => {
  test('expands_folders_deduplicates_and_returns_saved_documents_in_binder_order', () => {
    const result = resolveCompileSelection([folder, first, second], [folder.id, second.id, first.id], (id) => doc(id === first.id ? first : second))
    expect(result.map((document) => document.id)).toEqual([first.id, second.id])
  })

  test('rejects_an_empty_or_unknown_selection', () => {
    expect(() => resolveCompileSelection([folder, first], [], () => undefined)).toThrow('Select at least one document')
    expect(() => resolveCompileSelection([folder, first], ['55555555-5555-4555-8555-555555555555'], () => undefined)).toThrow('selection is invalid')
  })
})
