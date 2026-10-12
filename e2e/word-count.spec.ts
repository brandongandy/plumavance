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
