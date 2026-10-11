import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CompileFormat } from '@scr/shared'
import { chromium } from 'playwright-core'

import { runProcess } from './process.js'

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
}

export interface ConverterSet {
  convert(input: ConvertInput): Promise<CompileArtifact>
}

const mediaTypes: Record<CompileFormat, string> = {
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  markdown: 'text/markdown; charset=utf-8',
}

export function createLocalConverters(options: { chromiumPath?: string; pandocPath?: string } = {}): ConverterSet {
  return {
    async convert(input) {
      const directory = await mkdtemp(join(tmpdir(), 'scr-compile-'))
      const source = join(directory, 'source.html')
      const output = join(directory, input.filename)
      let disposed = false
      const dispose = async (): Promise<void> => {
        if (disposed) return
        disposed = true
        await rm(directory, { recursive: true, force: true })
      }
      try {
        await writeFile(source, input.html, 'utf8')
        if (input.format === 'pdf') {
          const browser = await chromium.launch({ executablePath: options.chromiumPath ?? process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true })
          try {
            const page = await browser.newPage()
            await page.setContent(input.html, { waitUntil: 'load' })
            await page.pdf({ path: output, format: 'Letter', printBackground: true, margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' } })
          } finally {
            await browser.close()
          }
        } else {
          const target = input.format === 'rtf' ? 'rtf' : 'gfm'
          await runProcess(options.pandocPath ?? process.env.PANDOC_PATH ?? 'pandoc', ['--from=html', `--to=${target}`, '--output', output, source])
        }
        return { path: output, filename: input.filename, mediaType: mediaTypes[input.format], dispose }
      } catch (error) {
        await dispose()
        throw error
      }
    },
  }
}
