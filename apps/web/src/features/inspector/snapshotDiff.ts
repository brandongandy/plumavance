import { diffWordsWithSpace } from 'diff'

export interface DiffPart {
  kind: 'added' | 'removed' | 'unchanged'
  text: string
}

export function buildSnapshotDiff(currentText: string, snapshotText: string): DiffPart[] {
  return diffWordsWithSpace(snapshotText, currentText).map((part) => ({
    kind: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
    text: part.value,
  }))
}
