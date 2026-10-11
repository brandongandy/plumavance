import { readdir } from 'node:fs/promises'

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
})
