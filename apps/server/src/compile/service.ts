import type { CompileRequest } from '@scr/shared'

import type { BinderService } from '../binder/service.js'
import type { DocumentRepository } from '../documents/repository.js'
import type { CompileArtifact, ConverterSet } from './converters.js'
import { renderCompileHtml, sanitizeFilename } from './render-html.js'
import { resolveCompileSelection } from './selection.js'

export interface CompileService {
  compile(projectId: string, request: CompileRequest): Promise<CompileArtifact>
}

export function createCompileService(binder: BinderService, documents: DocumentRepository, converters: ConverterSet): CompileService {
  return {
    async compile(projectId, request) {
      const selected = resolveCompileSelection(binder.listProject(projectId).items, request.itemIds, (id) => documents.find(id))
      const html = renderCompileHtml(selected, request)
      return converters.convert({ html, format: request.format, filename: sanitizeFilename(request.filename, request.format) })
    },
  }
}
