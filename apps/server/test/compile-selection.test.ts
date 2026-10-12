import type { BinderItemDto, DocumentDto } from '@pluma/shared'
import { describe, expect, test } from 'vitest'

import { resolveCompileSelection } from '../src/compile/selection.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-10-10T00:00:00.000Z'
const binder = (id: string, kind: 'folder' | 'document', parentId: string | null, position: number): BinderItemDto => ({ id, projectId, parentId, kind, title: id, position, trashedAt: null, createdAt: stamp, updatedAt: stamp })
const folder = binder('22222222-2222-4222-8222-222222222222', 'folder', null, 0)
const first = binder('33333333-3333-4333-8333-333333333333', 'document', folder.id, 0)
const second = binder('44444444-4444-4444-8444-444444444444', 'document', null, 1)
const nestedFolder = binder('55555555-5555-4555-8555-555555555555', 'folder', folder.id, 1)
const nestedDocument = binder('66666666-6666-4666-8666-666666666666', 'document', nestedFolder.id, 0)
const doc = (item: BinderItemDto): DocumentDto => ({ id: item.id, projectId, title: item.id, contentJson: { type: 'doc', content: [{ type: 'paragraph' }] }, contentText: '', notesText: '', revision: 0, savedAt: stamp })

describe('compile selection', () => {
  test('compile_rejects_a_selected_document_missing_its_document_row', () => {
    expect(() => resolveCompileSelection([first], [first.id], new Map())).toThrow(
      'document data is missing',
    )
  })

  test('expands_folders_and_returns_folder_and_document_entries_in_binder_order', () => {
    const items = [folder, first, nestedFolder, nestedDocument, second]
    const documents = new Map(
      items
        .filter((item) => item.kind === 'document')
        .map((item) => [item.id, doc(item)]),
    )
    const result = resolveCompileSelection(items, [folder.id, second.id, first.id], documents)

    expect(result).toMatchObject([
      { kind: 'folder', id: folder.id, parentId: null, title: folder.title, headingLevel: 1 },
      { kind: 'document', id: first.id, parentId: folder.id, headingLevel: 2 },
      { kind: 'folder', id: nestedFolder.id, parentId: folder.id, title: nestedFolder.title, headingLevel: 2 },
      { kind: 'document', id: nestedDocument.id, parentId: nestedFolder.id, headingLevel: 3 },
      { kind: 'document', id: second.id, parentId: null, headingLevel: 1 },
    ])
  })

  test('rejects_an_empty_or_unknown_selection', () => {
    expect(() => resolveCompileSelection([folder, first], [], new Map())).toThrow('Select at least one document')
    expect(() => resolveCompileSelection([folder, first], ['55555555-5555-4555-8555-555555555555'], new Map())).toThrow('selection is invalid')
  })

  test('uses_heading_levels_through_six_and_caps_deeper_items', () => {
    const levelTwo = binder('77777777-7777-4777-8777-777777777777', 'folder', folder.id, 0)
    const levelThree = binder('88888888-8888-4888-8888-888888888888', 'folder', levelTwo.id, 0)
    const levelFour = binder('99999999-9999-4999-8999-999999999999', 'folder', levelThree.id, 0)
    const levelFive = binder('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'folder', levelFour.id, 0)
    const levelSix = binder('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'folder', levelFive.id, 0)
    const deepDocument = binder('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'document', levelSix.id, 0)
    const items = [folder, levelTwo, levelThree, levelFour, levelFive, levelSix, deepDocument]

    const result = resolveCompileSelection(items, [folder.id], new Map([[deepDocument.id, doc(deepDocument)]]))

    expect(result.map((entry) => entry.headingLevel)).toEqual([1, 2, 3, 4, 5, 6, 6])
  })
})
