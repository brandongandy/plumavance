import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`workspace_at_${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await createProject(page, `Viewport ${viewport.width}`)
    await createDocument(page)
    const workspace = page.locator('[data-workspace]')
    await expect(workspace).toHaveAttribute('data-layout', viewport.width < 768 ? 'phone' : viewport.width < 1024 ? 'tablet' : 'desktop')
    await expect(page.locator('.eyebrow, .hero, .card, [class*="gradient"], [class*="glass"]')).toHaveCount(0)
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    expect(results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}.png`), fullPage: true })
  })
}
