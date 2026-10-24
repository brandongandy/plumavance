import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('creates_a_project_writes_notes_and_saves_explicitly', async ({ page }) => {
  await createProject(page, 'Writing Journey')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Opening')
  await page.getByLabel(/document editor$/i).fill('The first saved paragraph.')
  await page.getByLabel('Document notes').fill('Keep the opening quiet.')
  await expect(page.getByText('Unsaved', { exact: true }).first()).toBeVisible()
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Document title')).toHaveValue('Opening')
  await expect(page.getByLabel('Document notes')).toHaveValue('Keep the opening quiet.')
})

test('renders_the_editor_toolbar_icons', async ({ page }) => {
  await createProject(page, 'Formatting Journey')
  await createDocument(page)

  for (const label of ['Redo', 'Indent', 'Outdent', 'Block quote']) {
    const icon = page.getByRole('button', { name: label }).locator('.pi')
    await expect(icon).toBeVisible()
    const iconStyle = await icon.evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      return { content: style.content, fontFamily: style.fontFamily }
    })
    expect(iconStyle.content).not.toBe('none')
    expect(iconStyle.content).not.toBe('""')
    expect(iconStyle.fontFamily).toContain('primeicons')
  }
})
