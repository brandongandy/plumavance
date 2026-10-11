export type BinderItemKind = 'folder' | 'document'

export interface ProjectDto {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string
}

export interface BinderItemDto {
  id: string
  projectId: string
  parentId: string | null
  kind: BinderItemKind
  title: string
  position: number
  trashedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectDetailDto {
  project: ProjectDto
  items: BinderItemDto[]
  trashedItems: BinderItemDto[]
}

export type EditorNodeType =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'text'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'horizontalRule'
  | 'hardBreak'

export type EditorMarkType = 'bold' | 'italic' | 'underline' | 'strike'

export interface EditorMark {
  type: EditorMarkType
}

export interface EditorNode {
  type: EditorNodeType
  attrs?: Record<string, string | number | boolean | null>
  content?: EditorNode[]
  marks?: EditorMark[]
  text?: string
}

export interface EditorDocument extends EditorNode {
  type: 'doc'
}

export interface DocumentDto {
  id: string
  projectId: string
  title: string
  contentJson: EditorDocument
  contentText: string
  notesText: string
  revision: number
  savedAt: string
}

export interface SearchResultDto {
  id: string
  title: string
  excerpt: string
}

export interface SnapshotDto {
  id: string
  documentId: string
  name: string | null
  contentJson: EditorDocument
  contentText: string
  createdAt: string
}
