import type { CompileFormat, DocumentDto, EditorMark, EditorNode } from '@scr/shared'

import { ApiError } from '../http/errors.js'

const escape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string)

function marks(text: string, nodeMarks: EditorMark[] = []): string {
  return nodeMarks.reduce((value, mark) => {
    const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type]
    if (!tag) throw new ApiError(422, 'UNSUPPORTED_EDITOR_CONTENT', 'Unsupported editor content.')
    return `<${tag}>${value}</${tag}>`
  }, escape(text))
}

function renderNode(node: EditorNode): string {
  if (node.type === 'text') return marks(node.text ?? '', node.marks)
  const content = (node.content ?? []).map(renderNode).join('')
  switch (node.type) {
    case 'doc': return content
    case 'paragraph': return `<p>${content}</p>`
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      if (![1, 2, 3].includes(level)) throw new ApiError(422, 'UNSUPPORTED_EDITOR_CONTENT', 'Unsupported editor content.')
      return `<h${level}>${content}</h${level}>`
    }
    case 'blockquote': return `<blockquote>${content}</blockquote>`
    case 'bulletList': return `<ul>${content}</ul>`
    case 'orderedList': return `<ol>${content}</ol>`
    case 'listItem': return `<li>${content}</li>`
    case 'horizontalRule': return '<hr>'
    case 'hardBreak': return '<br>'
    default: throw new ApiError(422, 'UNSUPPORTED_EDITOR_CONTENT', 'Unsupported editor content.')
  }
}

export function renderCompileHtml(documents: DocumentDto[], options: { includeTitles: boolean; separateDocuments: boolean; format?: CompileFormat }): string {
  const sections = documents.map((document, index) => {
    const separator = options.separateDocuments && index > 0
      ? options.format === 'markdown' ? '<hr class="document-break">' : '<div class="document-break"></div>'
      : ''
    const title = options.includeTitles ? `<h1>${escape(document.title)}</h1>` : ''
    return `${separator}<section>${title}${renderNode(document.contentJson)}</section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12pt Georgia,serif;line-height:1.5}.document-break{break-before:page}h1,h2,h3{break-after:avoid}</style></head><body>${sections}</body></html>`
}

export function sanitizeFilename(filename: string, format: CompileFormat): string {
  const extension = format === 'markdown' ? 'md' : format
  const printable = [...filename]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
  const cleaned = printable.replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').replace(/^\.+/, '').trim() || 'export'
  return `${cleaned.replace(/\.(pdf|rtf|md|markdown)$/i, '')}.${extension}`
}
