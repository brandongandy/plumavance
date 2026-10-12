import type { CompileRequest } from '@pluma/shared'

import type { BinderService } from '../binder/service.js'
import { countWords } from '../db/functions.js'
import type { DocumentRepository } from '../documents/repository.js'
import type { CompileArtifact, ConverterSet } from './converters.js'
import { bundledFont } from './fonts.js'
import { renderCompileHtml, renderCompileStyles, sanitizeFilename } from './render-html.js'
import { resolveCompileDocumentIds, resolveCompileSelection } from './selection.js'

export interface CompileService {
  countWords(projectId: string, itemIds: string[]): number
  compile(projectId: string, request: CompileRequest, signal?: AbortSignal): Promise<CompileArtifact>
}

export function createCompileService(binder: BinderService, documents: DocumentRepository, converters: ConverterSet): CompileService {
  return {
    countWords(projectId, itemIds) {
      const items = binder.listProject(projectId).items
      const documentIds = resolveCompileDocumentIds(items, itemIds)
      const selected = resolveCompileSelection(items, itemIds, documents.findMany(documentIds))
      return selected.reduce((total, entry) =>
        total + (entry.kind === 'document' ? countWords(entry.document.contentText) : 0), 0)
    },
    async compile(projectId, request, signal) {
      const items = binder.listProject(projectId).items
      const documentIds = resolveCompileDocumentIds(items, request.itemIds)
      const selected = resolveCompileSelection(items, request.itemIds, documents.findMany(documentIds))
      const html = renderCompileHtml(selected, request)
      const epub = request.exportType === 'ereader' && request.format === 'epub'
        ? { stylesheet: renderCompileStyles(request, 'linked'), fonts: bundledFont(request.font, 'linked').assets }
        : undefined
      return converters.convert({
        html,
        format: request.format,
        filename: sanitizeFilename(request.filename, request.format),
        ...(epub ? { epub } : {}),
      }, signal)
    },
  }
}
