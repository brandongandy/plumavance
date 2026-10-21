import type { Page } from '@playwright/test'

export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('banner').getByLabel('Create project').click()
  await page.getByLabel('Project name').fill(name)
  await page.getByLabel('Confirm create project').click()
  await page.getByLabel(`Open ${name}`).click()
  await page.getByText(name, { exact: true }).waitFor()
}

export async function createDocument(page: Page): Promise<void> {
  const workspace = page.locator('[data-workspace]')
  await workspace.waitFor()
  const layout = await workspace.getAttribute('data-layout')
  if (layout === 'phone') await page.getByLabel('Binder panel').click()
  else if (layout === 'tablet') await page.getByLabel('Show binder').click()
  const created = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/items') && response.ok())
  await page.getByLabel('New document').click()
  const { id } = await (await created).json() as { id: string }
  await page.locator(`[data-document-pane="${id}"]`).getByLabel(/document editor$/i).waitFor()
}
