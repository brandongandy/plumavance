import { expect, test, type Page } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

async function counts(page: Page, project: number, daily: number): Promise<void> {
  await page.getByRole('button', { name: 'Writing progress settings', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(`${project} words | ${daily} words`)
}

async function settings(page: Page, project: string, daily: string, mode: 'additions' | 'net'): Promise<void> {
  await page.getByRole('button', { name: 'Writing progress settings', exact: true }).click()
  await page.getByLabel('Project word target', { exact: true }).fill(project)
  await page.getByLabel('Daily word target', { exact: true }).fill(daily)
  await page.getByLabel('Daily count mode').selectOption(mode)
  await page.getByRole('button', { name: 'Save writing settings', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Writing progress' })).toBeHidden()
}

test('uses native transactions to retain five plus three words across tabs and delayed duplicate acknowledgments', async ({ page, context }) => {
  await createProject(page, 'Two Tab Word Counts')
  await createDocument(page)
  const other = await context.newPage()
  await other.goto(page.url())
  await other.getByLabel('Document editor').waitFor()
  let release!: () => void
  let accepted!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const firstAccepted = new Promise<void>((resolve) => { accepted = resolve })
  let first = true
  const payloads: Array<{ eventId: string; delta: number; localDate: string }> = []
  await context.route('**/word-count-events', async (route) => {
    payloads.push(route.request().postDataJSON())
    const response = await route.fetch()
    if (first) {
      first = false
      accepted()
      await held
    }
    await route.fulfill({ response })
  })
  try {
    await page.getByLabel('Document editor').fill('one two three four five')
    await firstAccepted
    await other.getByLabel('Document editor').fill('six seven eight')
    const date = await page.evaluate(() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
    const projectId = page.url().split('/').at(-1)
    await expect.poll(async () => {
      const response = await page.request.get(`/api/projects/${projectId}/writing-progress?localDate=${date}`)
      return (await response.json()).dailyWordCount
    }).toBe(8)
    release()
    await counts(page, 5, 8)
    await counts(other, 3, 8)
    for (const payload of payloads) {
      for (const matching of payloads.filter((candidate) => candidate.eventId === payload.eventId)) expect(matching).toEqual(payload)
    }
    expect(new Set(payloads.map((payload) => payload.eventId)).size).toBe(2)
    await other.getByRole('button', { name: 'Writing progress settings', exact: true }).click()
    await expect(other.getByRole('dialog', { name: 'Writing progress' })).toContainText('Today: 8 words')
  } finally {
    release()
    await other.close()
  }
})

test('retains a single daily count through lost acknowledgment, reload and failed native outbox replay', async ({ page }) => {
  await createProject(page, 'Lost Ack Word Counts')
  await createDocument(page)
  let requests = 0
  let firstLost!: () => void
  const lost = new Promise<void>((resolve) => { firstLost = resolve })
  await page.route('**/word-count-events', async (route) => {
    if (++requests === 1) await route.fetch()
    await route.abort('failed')
    firstLost()
  })
  await page.getByLabel('Document editor').fill('one two three four five')
  await lost
  await page.reload()
  await expect.poll(() => requests).toBeGreaterThan(1)
  await counts(page, 0, 5)
  await page.getByRole('button', { name: 'Writing progress settings', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Writing progress' })).toContainText('Not synced')
  await page.keyboard.press('Escape')
  await page.unroute('**/word-count-events')
  await page.reload()
  await counts(page, 0, 5)
  await page.getByRole('button', { name: 'Writing progress settings', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Writing progress' })).toContainText('Synced')
})

test('tracks live writing, optional targets and modes, resets Edit Mode, and reconciles folder trash and restore', async ({ page }) => {
  await createProject(page, 'Word Count Journey')
  await createDocument(page)
  const editor = page.getByLabel('Document editor')
  await page.getByRole('button', { name: 'Writing progress settings', exact: true }).click()
  await expect(page.getByLabel('Project word target', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Daily word target', { exact: true })).toHaveValue('')
  await page.keyboard.press('Escape')
  await settings(page, '80000', '1000', 'additions')
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1000')
  await editor.fill('one two three four')
  await counts(page, 4, 4)
  await editor.fill('one two')
  await counts(page, 2, 4)
  await editor.fill('one two three four')
  await counts(page, 4, 6)
  await settings(page, '80000', '1000', 'net')
  await editor.fill('one two')
  await counts(page, 2, 4)
  await editor.fill('one two three four')
  await counts(page, 4, 6)
  await page.getByRole('switch', { name: 'Edit Mode' }).click()
  await editor.fill('one two three four five six')
  await counts(page, 6, 6)
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await counts(page, 6, 6)
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Edit Mode' })).toHaveAttribute('aria-checked', 'false')
  await counts(page, 6, 6)
  await settings(page, '', '1000', 'net')
  await settings(page, '', '', 'net')
  await expect(page.getByRole('progressbar')).toHaveCount(0)

  await page.getByLabel('New folder').click()
  const folder = page.getByRole('treeitem', { name: 'Untitled Folder, folder' })
  await folder.getByRole('textbox').fill('Chapters')
  await folder.getByRole('textbox').press('Enter')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Nested')
  await editor.fill('seven eight nine')
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await counts(page, 9, 9)
  await page.getByRole('treeitem', { name: 'Chapters, folder' }).click()
  await page.getByLabel('Move selected item to trash').click()
  await counts(page, 6, 9)
  await page.getByLabel('Restore Chapters').click()
  await counts(page, 9, 9)
})

test('shrinks the progress bar while retaining document counts on narrow workspaces', async ({ page }) => {
  await createProject(page, 'Compact Word Counts')
  await createDocument(page)
  await page.getByLabel('Document editor').fill('one two three')
  const footer = page.locator('footer')
  const progress = footer.locator('.writing-progress-track')
  const desktopWidth = (await progress.boundingBox())!.width
  expect(desktopWidth).toBeGreaterThan(180)
  for (const width of [600, 375, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const documentCounts = footer.getByText('3 words · 13 characters', { exact: true })
    await expect(documentCounts).toBeVisible()
    const bounds = (await documentCounts.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    const bar = (await progress.boundingBox())!
    expect(bar.width).toBeGreaterThanOrEqual(12)
    expect(bar.width).toBeLessThanOrEqual(desktopWidth)
    if (width === 320) expect(bar.width).toBeLessThan(desktopWidth)
  }
})

test('counts only selected saved bodies for direct documents and folders through the compile dirty gate', async ({ page }) => {
  await createProject(page, 'Compile Word Counts')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Opening title excluded')
  await page.getByLabel('Document editor').fill('one two')
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await page.getByLabel('New folder').click()
  const folder = page.getByRole('treeitem', { name: 'Untitled Folder, folder' })
  await folder.getByRole('textbox').fill('Chapter title excluded')
  await folder.getByRole('textbox').press('Enter')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Nested title excluded')
  await page.getByLabel('Document editor').fill('three four five')
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()

  const dialog = page.getByRole('dialog', { name: 'Compile', exact: true })
  const count = dialog.getByLabel('Compile word count', { exact: true })
  await page.getByRole('button', { name: 'Compile', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Opening title excluded', exact: true }).check()
  await expect(count).toHaveText('2 words')
  await dialog.getByRole('checkbox', { name: 'Nested title excluded', exact: true }).check()
  await expect(count).toHaveText('5 words')
  await dialog.getByRole('checkbox', { name: 'Chapter title excluded', exact: true }).check()
  await expect(count).toHaveText('5 words')
  await dialog.getByLabel('Clear compile selection').click()
  await expect(count).toHaveText('0 words')
  await dialog.getByRole('checkbox', { name: 'Chapter title excluded', exact: true }).check()
  await expect(count).toHaveText('3 words')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()

  await page.getByLabel('Document editor').fill('three four five six seven')
  await page.getByRole('button', { name: 'Compile', exact: true }).click()
  await dialog.getByLabel('Compile saved copy').click()
  await dialog.getByRole('checkbox', { name: 'Chapter title excluded', exact: true }).check()
  await expect(count).toHaveText('3 words')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Compile', exact: true }).click()
  await dialog.getByLabel('Save before compile').click()
  await dialog.getByRole('checkbox', { name: 'Chapter title excluded', exact: true }).check()
  await expect(count).toHaveText('5 words')
})
