import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('opens_compile_with_saved_copy_options_and_binder_order', async ({ page }) => {
  await createProject(page, 'Compile Journey')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Only Chapter')
  await page.getByLabel('Save document').click()
  await page.getByRole('button', { name: 'Compile' }).click()
  await page.getByText('Only Chapter', { exact: true }).last().click()
  await expect(page.getByLabel('Compile order')).toContainText('Only Chapter')
  await expect(page.getByLabel('Compile download')).toBeEnabled()
})
