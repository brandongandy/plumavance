import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('opens_compile_with_saved_copy_options_and_binder_order', async ({ page }) => {
  let compileRequest: Record<string, unknown> = {}
  await page.route('**/api/projects/*/compile', async (route) => {
    compileRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/epub+zip',
      headers: { 'content-disposition': `attachment; filename="export.epub"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.epub` },
      body: 'epub',
    })
  })
  await createProject(page, 'Compile Journey')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Only Chapter')
  await page.getByLabel('Save document').click()
  await page.getByRole('button', { name: 'Compile' }).click()
  await page.getByText('Only Chapter', { exact: true }).last().click()
  await expect(page.getByLabel('Compile order')).toContainText('Only Chapter')
  await expect(page.getByLabel('Compile download')).toBeEnabled()
  await page.getByRole('radio', { name: 'E-reader' }).check()
  await page.getByRole('radio', { name: 'EPUB' }).check()
  await page.getByRole('radio', { name: 'IBM Plex Sans' }).check()
  await page.getByLabel('Export filename').fill('日本語')
  const downloadPromise = page.waitForEvent('download')
  await page.getByLabel('Compile download').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('日本語.epub')
  expect(compileRequest).toMatchObject({
    exportType: 'ereader',
    format: 'epub',
    font: 'sans-serif',
    sceneSeparator: '#',
    chapterPageBreaks: true,
  })
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe('epub')
})
