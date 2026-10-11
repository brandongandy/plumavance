import type { CompileRequest } from '@scr/shared'

import { ApiRequestError } from './client.js'

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
