import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('previews_cancels_and_persists_editor_appearance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createProject(page, 'Appearance Journey')
  await createDocument(page)
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })

  await settingsButton.click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.locator('label').filter({ hasText: 'Monospace' }).click()
  await dialog.locator('label').filter({ hasText: 'Terminal' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-editor-font', 'monospace')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim())).toBe('#ffb454')

  await dialog.getByRole('button', { name: 'Cancel settings changes' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-editor-font', 'serif')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'helion-dark')
  await expect(settingsButton).toBeFocused()

  await settingsButton.click()
  await dialog.locator('label').filter({ hasText: 'Sans serif' }).click()
  await dialog.locator('label').filter({ hasText: 'Solarized Light' }).click()
  await dialog.getByRole('button', { name: 'Save settings' }).click()
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-editor-font', 'sans-serif')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'solarized-light')
  expect(await page.getByLabel(/document editor$/i).evaluate((element) => getComputedStyle(element).fontFamily)).toContain('IBM Plex Sans')
  await settingsButton.click()
  await expect(dialog.locator('input[name="editor-font"][value="sans-serif"]')).toBeChecked()
  await expect(dialog.locator('input[name="theme"][value="solarized-light"]')).toBeChecked()

  for (const [label, theme] of [
    ['Helion Dark', 'helion-dark'],
    ['Helion Light', 'helion-light'],
    ['Solarized Light', 'solarized-light'],
    ['Solarized Dark', 'solarized-dark'],
    ['Dracula', 'dracula'],
    ['Catppuccin', 'catppuccin'],
    ["Synthwave '84", 'synthwave-84'],
    ['Terminal', 'terminal'],
  ] as const) {
    await dialog.locator('label').filter({ hasText: label }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious'),
      `${label} accessibility violations`,
    ).toEqual([])
  }
})
