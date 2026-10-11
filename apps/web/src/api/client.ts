import type { ZodType } from 'zod'

interface ApiErrorEnvelope {
  code?: string
  message?: string
  details?: unknown
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, body: ApiErrorEnvelope) {
    super(body.message ?? 'The request failed.')
    this.name = 'ApiRequestError'
    this.status = status
    this.code = body.code ?? 'REQUEST_FAILED'
    this.details = body.details
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit,
  schema: ZodType<T>,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorEnvelope
    throw new ApiRequestError(response.status, body)
  }

  return schema.parse(await response.json())
}

export async function apiRequestEmpty(path: string, options: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorEnvelope
    throw new ApiRequestError(response.status, body)
  }
}
