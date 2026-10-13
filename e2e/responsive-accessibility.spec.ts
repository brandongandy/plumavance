import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`workspace_at_${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await createProject(page, `Viewport ${viewport.width}`)
    await createDocument(page)
    const workspace = page.locator('[data-workspace]')
    await expect(workspace).toHaveAttribute('data-layout', viewport.width < 768 ? 'phone' : viewport.width < 1024 ? 'tablet' : 'desktop')
    const toolbar = page.locator('header[aria-label="Application toolbar"]')
    expect(await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(page.getByLabel('Show inspector')).toBeInViewport()
    await expect(page.locator('.eyebrow, .hero, .card, [class*="gradient"], [class*="glass"]')).toHaveCount(0)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}.png`), fullPage: true })
  })
}

test('remains_operable_at_200_percent_zoom', async ({ page }) => {
  // A 640 CSS-pixel viewport is the reflow area produced by 200% browser zoom on a 1280px window.
  await page.setViewportSize({ width: 640, height: 400 })
  await createProject(page, 'Zoom Journey')
  await createDocument(page)
  await expect(page.getByLabel('Document title')).toBeVisible()
  await expect(page.getByLabel('Document editor')).toBeVisible()
  await expect(page.getByLabel('Mobile panel switcher')).toBeVisible()
})

test('supports_a_keyboard_writing_and_binder_journey', async ({ page }) => {
  await createProject(page, 'Keyboard Journey')
  await page.getByLabel('New document').focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('Document editor').focus()
  await page.keyboard.type('Keyboard draft')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  const selected = page.locator('[role="treeitem"][aria-selected="true"]')
  await selected.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('[role="treeitem"]:focus')).toBeVisible()
})

test('typewriter_mode_centers_the_first_and_last_paragraphs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await createProject(page, 'Focus Journey')
  await createDocument(page)
  const editor = page.getByLabel('Document editor')
  await editor.click()
  await page.keyboard.type('First')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Middle')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Last')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Focus' }).click()
  await expect(page.locator('.workspace-shell')).toHaveClass(/is-focus-mode/)
  await expect(editor).toBeFocused()

  await page.keyboard.type('X')
  await expect(editor.locator('p').last()).toHaveText('LaX')
  await page.waitForTimeout(250)
  const lastCenter = await editor.locator('p').last().evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  expect(Math.abs(lastCenter - 450)).toBeLessThan(130)

  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.type('>')
  await page.waitForTimeout(250)
  const firstCenter = await editor.locator('p').first().evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  expect(Math.abs(firstCenter - 450)).toBeLessThan(130)
})
