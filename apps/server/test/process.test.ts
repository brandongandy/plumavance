import { describe, expect, test } from 'vitest'

import { runProcess } from '../src/compile/process.js'

describe('compile process runner', () => {
  test('passes_arguments_without_a_shell', async () => {
    await expect(runProcess(process.execPath, ['-e', 'process.exit(process.argv[1] === "safe;value" ? 0 : 2)', 'safe;value'])).resolves.toBeUndefined()
  })

  test('maps_nonzero_exits_and_timeouts_to_stable_errors', async () => {
    await expect(runProcess(process.execPath, ['-e', 'process.exit(7)'])).rejects.toThrow('exited with code 7')
    await expect(runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 20 })).rejects.toThrow('timed out')
  })
})
