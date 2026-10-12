import { CompileWordCountResponseSchema, type CompileRequest } from '@pluma/shared'

import { ApiRequestError, apiRequest } from './client.js'

export async function requestCompileWordCount(projectId: string, itemIds: string[], signal?: AbortSignal): Promise<number> {
  const response = await apiRequest(`/api/projects/${projectId}/compile/word-count`, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
    ...(signal ? { signal } : {}),
  }, CompileWordCountResponseSchema)
  return response.wordCount
}

export async function requestCompile(projectId: string, request: CompileRequest): Promise<Response> {
  const response = await fetch(`/api/projects/${projectId}/compile`, {
    method: 'POST',
    headers: { accept: '*/*', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string }
    throw new ApiRequestError(response.status, body)
  }
  return response
}
