import {
  EditorDocumentSchema,
  type DocumentDto,
  type SaveDocumentRequest,
} from '@scr/shared'
import { z } from 'zod'

import { apiRequest } from './client.js'

const DocumentSchema: z.ZodType<DocumentDto> = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  contentJson: EditorDocumentSchema,
  contentText: z.string(),
  notesText: z.string(),
  revision: z.number().int().nonnegative(),
  savedAt: z.string(),
})

export const documentApi = {
  get: (documentId: string): Promise<DocumentDto> =>
    apiRequest(`/api/documents/${documentId}`, { method: 'GET' }, DocumentSchema),
  save: (documentId: string, input: SaveDocumentRequest): Promise<DocumentDto> =>
    apiRequest(
      `/api/documents/${documentId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      DocumentSchema,
    ),
}
