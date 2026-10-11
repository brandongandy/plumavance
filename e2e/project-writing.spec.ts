import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('creates_a_project_writes_notes_and_saves_explicitly', async ({ page }) => {
  await createProject(page, 'Writing Journey')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Opening')
  await page.getByLabel('Document editor').fill('The first saved paragraph.')
  await page.getByLabel('Document notes').fill('Keep the opening quiet.')
  await expect(page.getByText('Unsaved', { exact: true }).first()).toBeVisible()
  await page.getByLabel('Save document').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Document title')).toHaveValue('Opening')
  await expect(page.getByLabel('Document notes')).toHaveValue('Keep the opening quiet.')
})
