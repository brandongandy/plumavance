import type {
  BinderItemDto,
  BinderItemKind,
  ProjectDetailDto,
  SearchResultDto,
} from '@scr/shared'
import { z } from 'zod'

import { apiRequest, apiRequestEmpty } from './client.js'

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastOpenedAt: z.string(),
})

const BinderItemSchema: z.ZodType<BinderItemDto> = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(['folder', 'document']),
  title: z.string(),
  position: z.number(),
  trashedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ProjectDetailSchema: z.ZodType<ProjectDetailDto> = z.object({
  project: ProjectSchema,
  items: z.array(BinderItemSchema),
  trashedItems: z.array(BinderItemSchema),
})

const SearchResultSchema: z.ZodType<SearchResultDto> = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
})

export interface MoveItemInput {
  itemId: string
  parentId: string | null
  index: number
}

export const binderApi = {
  getProject: (projectId: string): Promise<ProjectDetailDto> =>
    apiRequest(`/api/projects/${projectId}`, { method: 'GET' }, ProjectDetailSchema),
  search: (projectId: string, query: string): Promise<SearchResultDto[]> =>
    apiRequest(
      `/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`,
      { method: 'GET' },
      z.array(SearchResultSchema),
    ),
  create: (
    projectId: string,
    input: { kind: BinderItemKind; parentId: string | null; title: string },
  ): Promise<BinderItemDto> =>
    apiRequest(
      `/api/projects/${projectId}/items`,
      { method: 'POST', body: JSON.stringify(input) },
      BinderItemSchema,
    ),
  rename: (itemId: string, title: string): Promise<BinderItemDto> =>
    apiRequest(
      `/api/items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ title }) },
      BinderItemSchema,
    ),
  move: ({ itemId, parentId, index }: MoveItemInput): Promise<BinderItemDto> =>
    apiRequest(
      `/api/items/${itemId}/move`,
      { method: 'POST', body: JSON.stringify({ parentId, index }) },
      BinderItemSchema,
    ),
  trash: (itemId: string): Promise<BinderItemDto> =>
    apiRequest(`/api/items/${itemId}/trash`, { method: 'POST' }, BinderItemSchema),
  restore: (itemId: string): Promise<BinderItemDto> =>
    apiRequest(`/api/items/${itemId}/restore`, { method: 'POST' }, BinderItemSchema),
  delete: (itemId: string): Promise<void> =>
    apiRequestEmpty(`/api/items/${itemId}`, { method: 'DELETE' }),
}
