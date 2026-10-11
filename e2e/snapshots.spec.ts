import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('takes_a_manual_snapshot_only_on_request', async ({ page }) => {
  await createProject(page, 'Snapshot Journey')
  await createDocument(page)
  await page.getByLabel('Document editor').fill('Saved before snapshot.')
  await page.getByLabel('Save document').click()
  await page.getByRole('tab', { name: 'Snapshots' }).click()
  await expect(page.getByText('No snapshots.')).toBeVisible()
  await page.getByLabel('Take snapshot').click()
  await page.getByLabel('Snapshot name').fill('First pass')
  await page.getByLabel('Confirm take snapshot').click()
  await expect(page.getByText('First pass')).toBeVisible()
})
