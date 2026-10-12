import type { CompileExportType, CompileFormat, EditorMark, EditorNode, EreaderFont, PaperbackPageSize } from '@pluma/shared'

import { ApiError } from '../http/errors.js'
import { bundledFont } from './fonts.js'
import type { CompilableEntry } from './selection.js'

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

interface RenderCompileOptions {
  exportType: CompileExportType
  format: CompileFormat
  font?: EreaderFont
  pageSize?: PaperbackPageSize | undefined
  includeTitles: boolean
  includeFolderTitles: boolean
  sceneSeparator: string
  chapterPageBreaks: boolean
}

export function renderCompileStyles(options: RenderCompileOptions, fontMode: 'embedded' | 'linked' = 'embedded'): string {
  const font = bundledFont(options.exportType === 'manuscript' ? 'monospace' : options.font ?? 'serif', fontMode)
  const common = `${font.css}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font-family:${font.family}}.chapter-break{break-before:page;height:0;overflow:hidden;border:0;margin:0;font-size:0;line-height:0}.scene-break{margin:1em 0;text-align:center;text-indent:0;break-inside:avoid}.scene-break-empty{min-height:1em}h1,h2,h3,h4,h5,h6{break-after:avoid}strong{font-weight:700}em{font-style:italic}`
  if (options.exportType === 'manuscript') {
    return `${common}@page{size:Letter;margin:1in}body{font-family:${font.family};font-size:12pt;line-height:2}p{margin:0;text-indent:.5in}h1,h2,h3,h4,h5,h6{font:inherit;text-align:center;margin:1em 0;text-indent:0}blockquote{margin:0 0 0 .5in}`
  }
  const dimensions = {
    'mass-market': '4.25in 6.87in',
    digest: '5.06in 7.81in',
    trade: '6in 9in',
  }[options.pageSize ?? 'digest']
  const page = options.format === 'pdf' ? `@page{size:${dimensions};margin:.7in .65in}` : ''
  return `${common}${page}body{font-family:${font.family};font-size:11pt;line-height:1.45}p{margin:0;text-indent:.25in}h1{font-size:1.6em;text-align:center;margin:2em 0 1.5em}h2{font-size:1.3em;margin:1.5em 0 .75em}h3{font-size:1.1em;margin:1.25em 0 .5em}h4{font-size:1em;margin:1em 0 .5em}h5{font-size:.95em;margin:1em 0 .5em}h6{font-size:.9em;margin:1em 0 .5em}h1+p,h2+p,h3+p,h4+p,h5+p,h6+p,blockquote p{ text-indent:0}blockquote{margin:1em .25in}`
}

function chapterBreak(format: CompileFormat): string {
  return format === 'epub'
    ? '<div class="chapter-break">&#160;</div>'
    : '<div class="chapter-break"></div>'
}

function sceneBreak(separator: string): string {
  return separator
    ? `<div class="scene-break">${escape(separator)}</div>`
    : '<div class="scene-break scene-break-empty">&#160;</div>'
}

export function renderCompileHtml(entries: CompilableEntry[], options: RenderCompileOptions): string {
  let hasRenderedContent = false
  let pendingChapterBreak = false
  let previousSceneParentId: string | null | undefined
  const sections = entries.map((entry) => {
    if (entry.kind === 'folder') {
      pendingChapterBreak = options.chapterPageBreaks && hasRenderedContent
      previousSceneParentId = undefined
      if (!options.includeFolderTitles) return ''
      const separator = pendingChapterBreak ? chapterBreak(options.format) : ''
      pendingChapterBreak = false
      hasRenderedContent = true
      return `${separator}<section class="folder-heading"><h${entry.headingLevel}>${escape(entry.title)}</h${entry.headingLevel}></section>`
    }

    const startsNewChapter = previousSceneParentId !== undefined
      && entry.parentId !== null
      && entry.parentId !== previousSceneParentId
    const sameChapter = previousSceneParentId !== undefined
      && entry.parentId !== null
      && entry.parentId === previousSceneParentId
    const separator = pendingChapterBreak || (options.chapterPageBreaks && startsNewChapter)
      ? chapterBreak(options.format)
      : sameChapter ? sceneBreak(options.sceneSeparator) : ''
    const titleLevel = options.includeFolderTitles ? entry.headingLevel : 1
    const title = options.includeTitles ? `<h${titleLevel}>${escape(entry.document.title)}</h${titleLevel}>` : ''
    pendingChapterBreak = false
    previousSceneParentId = entry.parentId
    hasRenderedContent = true
    return `${separator}<section>${title}${renderNode(entry.document.contentJson)}</section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${renderCompileStyles(options)}</style></head><body>${sections}</body></html>`
}

export function sanitizeFilename(filename: string, format: CompileFormat): string {
  const extension = format === 'markdown' ? 'md' : format
  const printable = [...filename]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
  const cleaned = printable.replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').replace(/^\.+/, '').trim() || 'export'
  return `${cleaned.replace(/\.(pdf|rtf|md|markdown|epub)$/i, '')}.${extension}`
}
