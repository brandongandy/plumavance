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
