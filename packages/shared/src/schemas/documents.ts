import { z } from 'zod'

import type { EditorDocument, EditorMark, EditorNode } from '../domain.js'
import { BinderTitleSchema } from './binder.js'

const nodeTypes = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
  'hardBreak',
])
const markTypes = new Set(['bold', 'italic', 'underline', 'strike'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEditorMark(value: unknown): value is EditorMark {
  return isPlainRecord(value) && typeof value.type === 'string' && markTypes.has(value.type)
}

function isEditorNode(value: unknown): value is EditorNode {
  if (!isPlainRecord(value) || typeof value.type !== 'string' || !nodeTypes.has(value.type)) return false
  if (value.type === 'text' && typeof value.text !== 'string') return false
  if (value.type !== 'text' && value.text !== undefined) return false
  if (value.content !== undefined && (!Array.isArray(value.content) || !value.content.every(isEditorNode))) {
    return false
  }
  if (value.marks !== undefined && (!Array.isArray(value.marks) || !value.marks.every(isEditorMark))) {
    return false
  }
  if (value.attrs !== undefined && !isPlainRecord(value.attrs)) return false
  return true
}

export function isEditorDocument(value: unknown): value is EditorDocument {
  return isEditorNode(value) && value.type === 'doc' && Array.isArray(value.content)
}

export const EditorDocumentSchema = z.custom<EditorDocument>(isEditorDocument, {
  message: 'Invalid editor document.',
})

export const SaveDocumentRequestSchema = z.object({
  title: BinderTitleSchema,
  contentJson: EditorDocumentSchema,
  notesText: z.string().max(500_000),
  expectedRevision: z.number().int().min(0),
})

export const SearchQuerySchema = z.string().trim().min(1).max(200)

export type SaveDocumentRequest = z.infer<typeof SaveDocumentRequestSchema>
