import { EditorDocumentSchema, type DocumentDto, type SnapshotDto } from '@scr/shared'
import { z } from 'zod'

import { apiRequest, apiRequestEmpty } from './client.js'

const SnapshotSchema: z.ZodType<SnapshotDto> = z.object({
  id: z.string(),
  documentId: z.string(),
  name: z.string().nullable(),
  contentJson: EditorDocumentSchema,
  contentText: z.string(),
  createdAt: z.string(),
})

const DocumentSchema: z.ZodType<DocumentDto> = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  contentJson: EditorDocumentSchema,
  contentText: z.string(),
  notesText: z.string(),
  revision: z.number(),
  savedAt: z.string(),
})

export const snapshotApi = {
  list: (documentId: string): Promise<SnapshotDto[]> =>
    apiRequest(`/api/documents/${documentId}/snapshots`, { method: 'GET' }, z.array(SnapshotSchema)),
  create: (documentId: string, name?: string): Promise<SnapshotDto> =>
    apiRequest(
      `/api/documents/${documentId}/snapshots`,
      { method: 'POST', body: JSON.stringify(name === undefined ? {} : { name }) },
      SnapshotSchema,
    ),
  get: (snapshotId: string): Promise<SnapshotDto> =>
    apiRequest(`/api/snapshots/${snapshotId}`, { method: 'GET' }, SnapshotSchema),
  rename: (snapshotId: string, name: string): Promise<SnapshotDto> =>
    apiRequest(
      `/api/snapshots/${snapshotId}`,
      { method: 'PATCH', body: JSON.stringify({ name }) },
      SnapshotSchema,
    ),
  restore: (snapshotId: string, expectedRevision: number): Promise<DocumentDto> =>
    apiRequest(
      `/api/snapshots/${snapshotId}/restore`,
      { method: 'POST', body: JSON.stringify({ expectedRevision }) },
      DocumentSchema,
    ),
  delete: (snapshotId: string): Promise<void> =>
    apiRequestEmpty(`/api/snapshots/${snapshotId}`, { method: 'DELETE' }),
}
