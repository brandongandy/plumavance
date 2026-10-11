import { describe, expect, test } from 'vitest'

import { buildSnapshotDiff } from '../src/features/inspector/snapshotDiff.js'

describe('snapshot word diff', () => {
  test('labels_inserted_deleted_and_unchanged_text_without_losing_spacing', () => {
    const parts = buildSnapshotDiff('The quiet room.', 'The dark room.')

    expect(parts).toEqual([
      { kind: 'unchanged', text: 'The ' },
      { kind: 'removed', text: 'dark' },
      { kind: 'added', text: 'quiet' },
      { kind: 'unchanged', text: ' room.' },
    ])
  })
})
