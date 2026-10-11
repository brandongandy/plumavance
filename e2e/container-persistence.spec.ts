import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

test.skip(process.env.RUN_CONTAINER_E2E !== '1', 'Runs only against the Docker persistence matrix.')
test('container_replacement_retains_data_and_real_converters_emit_expected_formats', async () => {
  test.setTimeout(240_000)
  const run = promisify(execFile)
  const projectName = `scr-e2e-${process.pid}`
  const port = process.env.SCR_CONTAINER_PORT ?? '34173'
  const compose = ['compose', '--project-name', projectName, '-f', 'compose.yaml']
  const environment = { ...process.env, SCR_PORT: port }
  const docker = (...args: string[]) => run('docker', [...compose, ...args], { cwd: process.cwd(), env: environment })
  const baseUrl = `http://127.0.0.1:${port}`

  try {
    await docker('up', '--build', '-d', '--wait')
    const project = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Persistent Novel' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    const document = await fetch(`${baseUrl}/api/projects/${project.id}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'document', parentId: null, title: 'Chapter' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    await fetch(`${baseUrl}/api/documents/${document.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Opening', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Persisted prose' }] }] }, notesText: 'Persisted note', expectedRevision: 0 }),
    })
    await fetch(`${baseUrl}/api/documents/${document.id}/snapshots`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Milestone' }),
    })

    await docker('stop', 'scr')
    await docker('rm', '-f', 'scr')
    await docker('up', '-d', '--wait')

    const reloaded = await fetch(`${baseUrl}/api/documents/${document.id}`).then((response) => response.json() as Promise<{ contentText: string; notesText: string }>)
    const snapshots = await fetch(`${baseUrl}/api/documents/${document.id}/snapshots`).then((response) => response.json() as Promise<Array<{ name: string }>>)
    expect(reloaded).toMatchObject({ contentText: 'Persisted prose', notesText: 'Persisted note' })
    expect(snapshots.map((snapshot) => snapshot.name)).toContain('Milestone')

    for (const [format, signature] of [['pdf', '%PDF'], ['rtf', '{\\rtf'], ['markdown', '# Opening']] as const) {
      const response = await fetch(`${baseUrl}/api/projects/${project.id}/compile`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemIds: [document.id], format, includeTitles: true, separateDocuments: true, filename: 'Export' }),
      })
      expect(response.status).toBe(200)
      const bytes = Buffer.from(await response.arrayBuffer())
      expect(bytes.subarray(0, format === 'markdown' ? bytes.length : 32).toString('utf8')).toContain(signature)
    }
  } finally {
    await docker('down', '--volumes', '--remove-orphans').catch(() => undefined)
  }
})
