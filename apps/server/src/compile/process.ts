import { spawn } from 'node:child_process'

export interface RunProcessOptions {
  cwd?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export function runProcess(command: string, args: string[], options: RunProcessOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let failure: Error | undefined
    let settled = false
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    const timer = setTimeout(() => {
      failure = new Error(`${command} timed out.`)
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 60_000)
    const abort = (): void => {
      failure = options.signal?.reason instanceof Error
        ? options.signal.reason
        : new Error('Process aborted.')
      child.kill('SIGKILL')
    }
    const finish = (result: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      result()
    }
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    child.once('error', (error) => finish(() => reject(failure ?? error)))
    child.once('exit', (code) => {
      finish(() => {
        if (failure) reject(failure)
        else if (code === 0) resolve()
        else reject(new Error(`${command} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : '.'}`))
      })
    })
  })
}
