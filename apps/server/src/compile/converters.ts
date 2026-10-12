import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CompileFormat } from '@pluma/shared'
import { chromium } from 'playwright-core'

import { runProcess, type RunProcessOptions } from './process.js'

export interface CompileArtifact {
  path: string
  filename: string
  mediaType: string
  dispose(): Promise<void>
}

export interface ConvertInput {
  html: string
  format: CompileFormat
  filename: string
  epub?: {
    stylesheet: string
    fonts: Array<{ path: string; filename: string }>
  }
}

export interface ConverterSet {
  convert(input: ConvertInput, signal?: AbortSignal): Promise<CompileArtifact>
}

const mediaTypes: Record<CompileFormat, string> = {
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  markdown: 'text/markdown; charset=utf-8',
  epub: 'application/epub+zip',
}

interface PdfOptions {
  path: string
  preferCSSPageSize: boolean
  printBackground: boolean
}

interface BrowserPage {
  setContent(html: string, options: { waitUntil: 'load' }): Promise<void>
  pdf(options: PdfOptions): Promise<unknown>
}

interface BrowserInstance {
  newPage(): Promise<BrowserPage>
  close(): Promise<void>
}

interface LocalConverterOptions {
  chromiumPath?: string
  pandocPath?: string
  temporaryRoot?: string
  timeoutMs?: number
  run?: (command: string, args: string[], options: RunProcessOptions) => Promise<void>
  launchBrowser?: (options: { executablePath: string; headless: boolean; timeout: number }) => Promise<BrowserInstance>
}

function applyManuscriptRtf(source: string): string {
  return source
    .replace('{\\rtf1\\ansi', '{\\rtf1\\ansi\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\fs24')
    .replace(/\\deff\d+/, '\\deff99')
    .replace('{\\fonttbl', '{\\fonttbl{\\f99 \\fmodern IBM Plex Mono;}')
    .replaceAll('{\\pard ', '{\\pard \\sl480\\slmult1 ')
    .replaceAll(' \\f0 ', ' \\f99 ')
    .replace(/\\fs\d+/g, '\\fs24')
    .replace(/\\sa180 \\li0 \\fi0 (?!\\outlinelevel)/g, '\\sa0 \\li0 \\fi720 ')
}

const rtfPageBreakFilter = String.raw`function Div(element)
  for _, class in ipairs(element.classes) do
    if class == 'chapter-break' then
      return pandoc.RawBlock('rtf', '\\page')
    end
  end
end
`

export function createLocalConverters(options: LocalConverterOptions = {}): ConverterSet {
  return {
    async convert(input, parentSignal) {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(new Error('Conversion timed out.')),
        options.timeoutMs ?? 60_000,
      )
      const abortFromParent = (): void => controller.abort(
        parentSignal?.reason instanceof Error ? parentSignal.reason : new Error('Client disconnected.'),
      )
      if (parentSignal?.aborted) abortFromParent()
      else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
      const signal = controller.signal
      const directory = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'pluma-compile-'))
      const source = join(directory, 'source.html')
      const output = join(directory, input.filename)
      let disposed = false
      const dispose = async (): Promise<void> => {
        if (disposed) return
        disposed = true
        await rm(directory, { recursive: true, force: true })
      }
      try {
        signal.throwIfAborted()
        await writeFile(source, input.html, 'utf8')
        if (input.format === 'pdf') {
          const browser = await (options.launchBrowser ?? chromium.launch.bind(chromium))({
            executablePath: options.chromiumPath ?? process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
            headless: true,
            timeout: options.timeoutMs ?? 60_000,
          })
          const closeOnAbort = (): void => { void browser.close() }
          signal.addEventListener('abort', closeOnAbort, { once: true })
          try {
            signal.throwIfAborted()
            const page = await browser.newPage()
            await page.setContent(input.html, { waitUntil: 'load' })
            await page.pdf({ path: output, preferCSSPageSize: true, printBackground: true })
            signal.throwIfAborted()
          } finally {
            signal.removeEventListener('abort', closeOnAbort)
            await browser.close()
          }
        } else {
          const target = input.format === 'rtf' ? 'rtf' : input.format === 'epub' ? 'epub3' : 'gfm'
          const pandocArguments: string[] = []
          if (input.format === 'rtf') {
            const pageBreakFilter = join(directory, 'page-breaks.lua')
            await writeFile(pageBreakFilter, rtfPageBreakFilter, 'utf8')
            pandocArguments.push(`--lua-filter=${pageBreakFilter}`)
          }
          if (input.format === 'epub') {
            if (!input.epub) throw new Error('EPUB resources are required.')
            const stylesheet = join(directory, 'publication.css')
            await writeFile(stylesheet, input.epub.stylesheet, 'utf8')
            pandocArguments.push(`--css=${stylesheet}`)
            for (const font of input.epub.fonts) {
              const fontTarget = join(directory, font.filename)
              await copyFile(font.path, fontTarget)
              pandocArguments.push(`--epub-embed-font=${fontTarget}`)
            }
          }
          await (options.run ?? runProcess)(
            options.pandocPath ?? process.env.PANDOC_PATH ?? 'pandoc',
            ['--from=html', `--to=${target}`, ...(input.format === 'rtf' || input.format === 'epub' ? ['--standalone'] : []), ...pandocArguments, '--output', output, source],
            { signal, timeoutMs: options.timeoutMs ?? 60_000 },
          )
          if (input.format === 'rtf') await writeFile(output, applyManuscriptRtf(await readFile(output, 'utf8')), 'utf8')
        }
        return { path: output, filename: input.filename, mediaType: mediaTypes[input.format], dispose }
      } catch (error) {
        await dispose()
        throw error
      } finally {
        clearTimeout(timeout)
        parentSignal?.removeEventListener('abort', abortFromParent)
      }
    },
  }
}
