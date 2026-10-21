import type { SnapshotDto, SnapshotSummaryDto } from '@pluma/shared'

export type SnapshotPaneMode = 'preview' | 'compare'

export interface SnapshotOpenRequest {
  documentId: string
  mode: SnapshotPaneMode
  snapshot: SnapshotSummaryDto
}

export interface SnapshotPaneState {
  mode: SnapshotPaneMode
  summary: SnapshotSummaryDto
  detail: SnapshotDto | null
  currentText: string
  loading: boolean
  error: string
}
