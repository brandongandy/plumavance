import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CompileFormat } from '@scr/shared'
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
}

export interface ConverterSet {
  convert(input: ConvertInput, signal?: AbortSignal): Promise<CompileArtifact>
}

const mediaTypes: Record<CompileFormat, string> = {
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  markdown: 'text/markdown; charset=utf-8',
}

interface LocalConverterOptions {
  chromiumPath?: string
  pandocPath?: string
  temporaryRoot?: string
  timeoutMs?: number
  run?: (command: string, args: string[], options: RunProcessOptions) => Promise<void>
}

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
      const directory = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'scr-compile-'))
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
          const browser = await chromium.launch({
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
            await page.pdf({ path: output, format: 'Letter', printBackground: true, margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' } })
            signal.throwIfAborted()
          } finally {
            signal.removeEventListener('abort', closeOnAbort)
            await browser.close()
          }
        } else {
          const target = input.format === 'rtf' ? 'rtf' : 'gfm'
          await (options.run ?? runProcess)(
            options.pandocPath ?? process.env.PANDOC_PATH ?? 'pandoc',
            ['--from=html', `--to=${target}`, '--output', output, source],
            { signal, timeoutMs: options.timeoutMs ?? 60_000 },
          )
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
