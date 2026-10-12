import type { DocumentDto } from '@pluma/shared'
import { describe, expect, test } from 'vitest'

import { renderCompileHtml, renderCompileStyles, sanitizeFilename } from '../src/compile/render-html.js'
import type { CompilableEntry } from '../src/compile/selection.js'

const document = (
  contentJson: DocumentDto['contentJson'],
  headingLevel = 1,
  id = '1',
  parentId: string | null = 'chapter-one',
): CompilableEntry => ({
  kind: 'document',
  id,
  parentId,
  headingLevel,
  document: { id, projectId: 'p', title: '<Opening>', contentJson, contentText: '', notesText: '', revision: 1, savedAt: '' },
})

const compileOptions = (overrides: Record<string, unknown> = {}) => ({
  exportType: 'manuscript' as const,
  format: 'pdf' as const,
  includeTitles: false,
  includeFolderTitles: false,
  sceneSeparator: '#',
  chapterPageBreaks: false,
  ...overrides,
})

describe('compile rendering', () => {
  test('escapes_text_renders_titles_and_document_breaks', () => {
    const html = renderCompileHtml([document({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'bold' }] }] }] })], compileOptions({ includeTitles: true, includeFolderTitles: true }))
    expect(html).toContain('<h1>&lt;Opening&gt;</h1>')
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>')
    expect(html).not.toContain('<script>')
  })

  test('rejects_unknown_nodes_and_sanitizes_filenames', () => {
    expect(() => renderCompileHtml([document({ type: 'doc', content: [{ type: 'script' as 'paragraph' }] })], compileOptions())).toThrow('Unsupported editor content')
    expect(sanitizeFilename('../My\u0000/Draft', 'pdf')).toBe('My Draft.pdf')
  })

  test('renders_submission_ready_manuscript_typography', () => {
    const html = renderCompileHtml([document({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }] })], compileOptions())

    expect(html).toContain('@page{size:Letter;margin:1in}')
    expect(html).toContain("font-family:'IBM Plex Mono',monospace")
    expect(html).toContain('src:url(data:font/woff2;base64,')
    expect(html).toContain('font-size:12pt;line-height:2')
    expect(html).toContain('text-indent:.5in')
  })

  test('renders_reflowable_ereader_typography_with_the_selected_font', () => {
    const html = renderCompileHtml([document({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }] })], compileOptions({
      exportType: 'ereader',
      format: 'epub',
      font: 'sans-serif',
    }))

    expect(html).not.toContain('@page{size:6in 9in')
    expect(html).toContain("font-family:'IBM Plex Sans',sans-serif")
    expect(html).toContain('font-size:11pt;line-height:1.45')
    expect(html).toContain('text-indent:.25in')
  })

  test('defaults_ereader_pdf_pages_to_digest_size', () => {
    const html = renderCompileHtml([document({ type: 'doc', content: [] })], compileOptions({
      exportType: 'ereader',
      format: 'pdf',
      font: 'serif',
    }))

    expect(html).toContain('@page{size:5.06in 7.81in;margin:.7in .65in}')
    expect(html).toContain("font-family:'Literata',serif")
  })

  test.each([
    ['mass-market', '4.25in 6.87in'],
    ['trade', '6in 9in'],
  ])('renders_the_selected_%s_ereader_pdf_page_size', (pageSize, dimensions) => {
    const html = renderCompileHtml([document({ type: 'doc', content: [] })], compileOptions({
      exportType: 'ereader',
      format: 'pdf',
      font: 'serif',
      pageSize,
    }))

    expect(html).toContain(`@page{size:${dimensions};margin:.7in .65in}`)
  })

  test('renders_an_escaped_separator_between_scenes_in_the_same_chapter', () => {
    const html = renderCompileHtml([
      document({ type: 'doc', content: [] }, 2, 'scene-one'),
      document({ type: 'doc', content: [] }, 2, 'scene-two'),
    ], compileOptions({ sceneSeparator: '<#&>' }))

    expect(html).toContain('<div class="scene-break">&lt;#&amp;&gt;</div>')
    expect(html.match(/class="scene-break"/g)).toHaveLength(1)
  })

  test('renders_blank_space_when_the_scene_separator_is_empty', () => {
    const html = renderCompileHtml([
      document({ type: 'doc', content: [] }, 2, 'scene-one'),
      document({ type: 'doc', content: [] }, 2, 'scene-two'),
    ], compileOptions({ sceneSeparator: '' }))

    expect(html).toContain('<div class="scene-break scene-break-empty">&#160;</div>')
  })

  test('keeps_horizontal_rules_inside_a_scene_unchanged', () => {
    const html = renderCompileHtml([
      document({ type: 'doc', content: [{ type: 'horizontalRule' }] }),
    ], compileOptions())

    expect(html).toContain('<section><hr></section>')
  })

  test('links_epub_stylesheets_to_pandocs_embedded_font_directory', () => {
    const styles = renderCompileStyles(compileOptions({
      exportType: 'ereader',
      format: 'epub',
      font: 'serif',
    }), 'linked')

    expect(styles).toContain('url(../fonts/literata-latin-400-normal.woff2)')
  })

  test('omits_folder_titles_and_promotes_document_titles_when_disabled', () => {
    const html = renderCompileHtml([
      { kind: 'folder', id: 'folder', parentId: null, title: 'Part One', headingLevel: 1 },
      document({ type: 'doc', content: [] }, 2),
    ], compileOptions({ format: 'markdown', includeTitles: true }))

    expect(html).not.toContain('Part One')
    expect(html).toContain('<h1>&lt;Opening&gt;</h1>')
  })

  test('starts_each_subsequent_chapter_on_a_new_page_when_enabled', () => {
    const html = renderCompileHtml([
      { kind: 'folder', id: 'chapter-one', parentId: null, title: 'Part One', headingLevel: 1 },
      document({ type: 'doc', content: [] }, 2, 'scene-one', 'chapter-one'),
      { kind: 'folder', id: 'chapter-two', parentId: null, title: 'Part Two', headingLevel: 1 },
      document({ type: 'doc', content: [] }, 2, 'scene-two', 'chapter-two'),
    ], compileOptions({ includeTitles: true, includeFolderTitles: true, chapterPageBreaks: true }))

    expect(html.match(/class="chapter-break"/g)).toHaveLength(1)
    expect(html.indexOf('class="chapter-break"')).toBeLessThan(html.indexOf('Part Two'))
    expect(html.indexOf('Part Two')).toBeLessThan(html.lastIndexOf('&lt;Opening&gt;'))
  })

  test('does_not_add_page_breaks_or_scene_separators_between_chapters_when_disabled', () => {
    const html = renderCompileHtml([
      document({ type: 'doc', content: [] }, 2, 'scene-one', 'chapter-one'),
      document({ type: 'doc', content: [] }, 2, 'scene-two', 'chapter-two'),
    ], compileOptions())

    expect(html).not.toContain('class="chapter-break"')
    expect(html).not.toContain('class="scene-break"')
  })
})
