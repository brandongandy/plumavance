import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { createLocalConverters } from '../src/compile/converters.js'
import { createTemporaryDatabase } from './helpers/database.js'

const input = { html: '<p>Draft</p>', format: 'markdown' as const, filename: 'draft.md' }

describe('local converter cleanup', () => {
  test('removes_its_temporary_directory_when_conversion_fails', async () => {
    const temporary = await createTemporaryDatabase()
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      run: vi.fn(async () => { throw new Error('Conversion failed.') }),
    })

    await expect(converters.convert(input)).rejects.toThrow('Conversion failed')
    expect(await readdir(temporary.directory)).toEqual([])
    await temporary.cleanup()
  })

  test('aborts_timed_out_work_and_removes_its_temporary_directory', async () => {
    const temporary = await createTemporaryDatabase()
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      timeoutMs: 20,
      run: vi.fn((_command, _args, options) => new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      })),
    })

    await expect(converters.convert(input)).rejects.toThrow('timed out')
    expect(await readdir(temporary.directory)).toEqual([])
    await temporary.cleanup()
  })

  test('aborts_disconnected_work_and_removes_its_temporary_directory', async () => {
    const temporary = await createTemporaryDatabase()
    const controller = new AbortController()
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      run: vi.fn((_command, _args, options) => new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      })),
    })

    const converting = converters.convert(input, controller.signal)
    controller.abort(new Error('Client disconnected.'))
    await expect(converting).rejects.toThrow('Client disconnected')
    expect(await readdir(temporary.directory)).toEqual([])
    await temporary.cleanup()
  })

  test('creates_a_standalone_epub_artifact', async () => {
    const temporary = await createTemporaryDatabase()
    let receivedArgs: string[] = []
    let receivedStylesheet = ''
    let receivedFont = ''
    const fontSource = join(temporary.directory, 'literata.woff2')
    await writeFile(fontSource, 'font-data')
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      run: vi.fn(async (_command, args) => {
        receivedArgs = args
        const stylesheet = args.find((argument) => argument.startsWith('--css='))?.slice('--css='.length)
        const font = args.find((argument) => argument.startsWith('--epub-embed-font='))?.slice('--epub-embed-font='.length)
        receivedStylesheet = await readFile(stylesheet as string, 'utf8')
        receivedFont = await readFile(font as string, 'utf8')
        const outputIndex = args.indexOf('--output') + 1
        await writeFile(args[outputIndex] as string, 'epub')
      }),
    })

    const artifact = await converters.convert({
      html: '<p>Draft</p>',
      format: 'epub',
      filename: 'draft.epub',
      epub: {
        stylesheet: "body{font-family:'Literata',serif}",
        fonts: [{ path: fontSource, filename: 'literata-latin-400-normal.woff2' }],
      },
    })

    expect(receivedArgs).toContain('--to=epub3')
    expect(receivedArgs).toContain('--standalone')
    expect(receivedArgs.some((argument) => argument.startsWith('--css='))).toBe(true)
    expect(receivedArgs.some((argument) => argument.startsWith('--epub-embed-font='))).toBe(true)
    expect(receivedStylesheet).toBe("body{font-family:'Literata',serif}")
    expect(receivedFont).toBe('font-data')
    expect(artifact.filename).toBe('draft.epub')
    expect(artifact.mediaType).toBe('application/epub+zip')
    await artifact.dispose()
    expect(await readdir(temporary.directory)).toEqual(['literata.woff2'])
    await temporary.cleanup()
  })

  test('lets_the_print_stylesheet_control_pdf_page_size_and_margins', async () => {
    const temporary = await createTemporaryDatabase()
    let pdfOptions: Record<string, unknown> = {}
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      launchBrowser: async () => ({
        newPage: async () => ({
          setContent: async () => undefined,
          pdf: async (options) => {
            pdfOptions = options
            await writeFile(options.path, 'pdf')
          },
        }),
        close: async () => undefined,
      }),
    })

    const artifact = await converters.convert({ html: '<style>@page{size:6in 9in}</style>', format: 'pdf', filename: 'draft.pdf' })

    expect(pdfOptions).toMatchObject({ preferCSSPageSize: true, printBackground: true })
    expect(pdfOptions).not.toHaveProperty('format')
    expect(pdfOptions).not.toHaveProperty('margin')
    await artifact.dispose()
    await temporary.cleanup()
  })

  test('applies_manuscript_page_and_paragraph_rules_to_rtf_output', async () => {
    const temporary = await createTemporaryDatabase()
    let pageBreakFilter = ''
    const converters = createLocalConverters({
      temporaryRoot: temporary.directory,
      run: vi.fn(async (_command, args) => {
        const filter = args.find((argument) => argument.startsWith('--lua-filter='))?.slice('--lua-filter='.length)
        pageBreakFilter = await readFile(filter as string, 'utf8')
        const output = args[args.indexOf('--output') + 1] as string
        await writeFile(output, '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 \\fswiss Helvetica;}}\n\\widowctrl\\hyphauto\n\n{\\pard \\ql \\f0 \\sa180 \\li0 \\fi0 Draft text.\\par}\n}')
      }),
    })

    const artifact = await converters.convert({ html: '<p>Draft text.</p>', format: 'rtf', filename: 'draft.rtf' })
    const output = await readFile(artifact.path, 'utf8')

    expect(output).toContain('\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440')
    expect(output).toContain('\\deff99')
    expect(output).toContain('{\\f99 \\fmodern IBM Plex Mono;}')
    expect(output).toContain('{\\pard \\sl480\\slmult1 \\ql \\f99 \\sa0 \\li0 \\fi720 Draft text.\\par}')
    expect(pageBreakFilter).toContain("class == 'chapter-break'")
    expect(pageBreakFilter).toContain("pandoc.RawBlock('rtf', '\\\\page')")
    await artifact.dispose()
    await temporary.cleanup()
  })
})
