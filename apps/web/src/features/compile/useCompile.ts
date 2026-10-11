import type { CompileRequest } from '@scr/shared'
import { ref, type Ref } from 'vue'

import { requestCompile } from '../../api/compile.js'

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // Fall through to the ASCII filename.
    }
  }
  const match = disposition.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? fallback
}

export function useCompile(): {
  compiling: Ref<boolean>
  error: Ref<string>
  compile: (projectId: string, request: CompileRequest) => Promise<boolean>
} {
  const compiling = ref(false)
  const error = ref('')
  const compile = async (projectId: string, request: CompileRequest): Promise<boolean> => {
    compiling.value = true
    error.value = ''
    try {
      const response = await requestCompile(projectId, request)
      const url = URL.createObjectURL(await response.blob())
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = responseFilename(response, request.filename)
        anchor.click()
      } finally {
        URL.revokeObjectURL(url)
      }
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Compilation failed.'
      return false
    } finally {
      compiling.value = false
    }
  }
  return { compiling, error, compile }
}
