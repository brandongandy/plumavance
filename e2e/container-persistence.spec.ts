import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

test.skip(process.env.RUN_CONTAINER_E2E !== '1', 'Runs only against the Docker persistence matrix.')
test('container_replacement_retains_data_and_real_converters_emit_expected_formats', async () => {
  test.setTimeout(240_000)
  const run = promisify(execFile)
  const projectName = `pluma-e2e-${process.pid}`
  const port = process.env.PLUMA_CONTAINER_PORT ?? '34173'
  const compose = ['compose', '--project-name', projectName, '-f', 'compose.yaml']
  const environment = { ...process.env, PLUMA_PORT: port }
  const docker = (...args: string[]) => run('docker', [...compose, ...args], { cwd: process.cwd(), env: environment })
  const baseUrl = `http://127.0.0.1:${port}`

  try {
    await docker('up', '--build', '-d', '--wait')
    const project = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Persistent Novel' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    const firstChapter = await fetch(`${baseUrl}/api/projects/${project.id}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'folder', parentId: null, title: 'Chapter One' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    const document = await fetch(`${baseUrl}/api/projects/${project.id}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'document', parentId: firstChapter.id, title: 'Scene One' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    await fetch(`${baseUrl}/api/documents/${document.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Opening', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Persisted prose' }] }] }, notesText: 'Persisted note', expectedRevision: 0 }),
    })
    const secondChapter = await fetch(`${baseUrl}/api/projects/${project.id}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'folder', parentId: null, title: 'Chapter Two' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    const secondDocument = await fetch(`${baseUrl}/api/projects/${project.id}/items`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'document', parentId: secondChapter.id, title: 'Scene One' }),
    }).then((response) => response.json() as Promise<{ id: string }>)
    await fetch(`${baseUrl}/api/documents/${secondDocument.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Ending', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second chapter' }] }] }, notesText: '', expectedRevision: 0 }),
    })
    await fetch(`${baseUrl}/api/documents/${document.id}/snapshots`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Milestone' }),
    })

    await docker('stop', 'pluma')
    await docker('rm', '-f', 'pluma')
    await docker('up', '-d', '--wait')

    const reloaded = await fetch(`${baseUrl}/api/documents/${document.id}`).then((response) => response.json() as Promise<{ contentText: string; notesText: string }>)
    const snapshots = await fetch(`${baseUrl}/api/documents/${document.id}/snapshots`).then((response) => response.json() as Promise<Array<{ name: string }>>)
    expect(reloaded).toMatchObject({ contentText: 'Persisted prose', notesText: 'Persisted note' })
    expect(snapshots.map((snapshot) => snapshot.name)).toContain('Milestone')

    const exportCases = [
      { exportType: 'manuscript', format: 'pdf', signature: '%PDF' },
      { exportType: 'manuscript', format: 'rtf', signature: '{\\rtf' },
      { exportType: 'manuscript', format: 'markdown', signature: '# Opening' },
      { exportType: 'ereader', format: 'epub', font: 'serif', signature: 'PK' },
    ] as const
    for (const { signature, ...exportOptions } of exportCases) {
      const isEpub = exportOptions.format === 'epub'
      const hasTwoChapters = isEpub || exportOptions.format === 'rtf'
      const response = await fetch(`${baseUrl}/api/projects/${project.id}/compile`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemIds: hasTwoChapters ? [document.id, secondDocument.id] : [document.id], includeTitles: !isEpub, sceneSeparator: '#', chapterPageBreaks: true, filename: 'Export', ...exportOptions }),
      })
      expect(response.status).toBe(200)
      const bytes = Buffer.from(await response.arrayBuffer())
      expect(bytes.subarray(0, exportOptions.format === 'markdown' ? bytes.length : 32).toString('utf8')).toContain(signature)
      if (exportOptions.format === 'rtf') {
        const rtf = bytes.toString('utf8')
        expect(rtf).toContain('\\deff99')
        expect(rtf).toContain('\\paperw12240\\paperh15840')
        expect(rtf).toContain('\\sl480\\slmult1')
        expect(rtf).toContain('\\fi720')
        expect(rtf).toContain('\\page')
      }
      if (exportOptions.format === 'epub') {
        const directory = await mkdtemp(join(tmpdir(), 'pluma-epub-e2e-'))
        try {
          const archive = join(directory, 'export.epub')
          await writeFile(archive, bytes)
          const listing = await run('unzip', ['-Z1', archive])
          const stylesheet = await run('unzip', ['-p', archive, '*.css'])
          const content = await run('unzip', ['-p', archive, '*.xhtml'])
          expect(listing.stdout).toContain('.woff2')
          expect(stylesheet.stdout).toContain("font-family:'Literata',serif")
          expect(stylesheet.stdout).toContain('url(../fonts/literata-latin-400-normal.woff2)')
          expect(stylesheet.stdout).toContain('.chapter-break')
          expect(content.stdout).toContain('class="chapter-break"')
          expect(content.stdout).toContain('Second chapter')
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    }
  } finally {
    await docker('down', '--volumes', '--remove-orphans').catch(() => undefined)
  }
})
