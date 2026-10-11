import type { DocumentDto } from '@scr/shared'
import { describe, expect, test } from 'vitest'

import { renderCompileHtml, sanitizeFilename } from '../src/compile/render-html.js'

const document = (contentJson: DocumentDto['contentJson']): DocumentDto => ({ id: '1', projectId: 'p', title: '<Opening>', contentJson, contentText: '', notesText: '', revision: 1, savedAt: '' })

describe('compile rendering', () => {
  test('escapes_text_renders_titles_and_document_breaks', () => {
    const html = renderCompileHtml([document({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'bold' }] }] }] })], { includeTitles: true, separateDocuments: true })
    expect(html).toContain('<h1>&lt;Opening&gt;</h1>')
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>')
    expect(html).not.toContain('<script>')
  })

  test('rejects_unknown_nodes_and_sanitizes_filenames', () => {
    expect(() => renderCompileHtml([document({ type: 'doc', content: [{ type: 'script' as 'paragraph' }] })], { includeTitles: false, separateDocuments: false })).toThrow('Unsupported editor content')
    expect(sanitizeFilename('../My\u0000/Draft', 'pdf')).toBe('My Draft.pdf')
  })
})
