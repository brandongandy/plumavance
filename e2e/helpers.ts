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
  if ((await workspace.getAttribute('data-layout')) !== 'desktop') await page.getByLabel('Show binder').click()
  await page.getByLabel('New document').click()
  await page.getByLabel('Document editor').waitFor()
}
