import { expect, test } from '@playwright/test'

import { createDocument, createProject } from './helpers.js'

test('uses_active_theme_tokens_for_compile_dialog_chrome_and_controls', async ({ page }) => {
  await createProject(page, 'Themed Compile Journey')
  await createDocument(page)
  await page.getByRole('button', { name: 'Compile' }).click()

  const dialog = page.getByRole('dialog', { name: 'Compile', exact: true })
  await expect(dialog).toBeVisible()

  for (const theme of ['helion-dark', 'solarized-light']) {
    await page.locator('html').evaluate((root, nextTheme) => {
      root.dataset.theme = nextTheme
    }, theme)

    const tokens = await page.evaluate(() => {
      const normalizedColor = (color: string) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d') as CanvasRenderingContext2D
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      }
      const tokenColor = (token: string) => {
        const probe = document.createElement('span')
        probe.style.color = `var(${token})`
        document.body.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return color
      }
      const mixedTokenColor = (token: string, amount: number) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = `color-mix(in srgb, var(${token}) ${amount}%, transparent)`
        document.body.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      }

      return {
        app: tokenColor('--color-app'),
        chrome: tokenColor('--color-chrome'),
        focus: tokenColor('--color-focus'),
        mask: normalizedColor(mixedTokenColor('--color-app', 80)),
        text: tokenColor('--color-text'),
      }
    })

    await expect.poll(() => dialog.evaluate((element) => {
      const style = (selector: string) => getComputedStyle(element.querySelector(selector) as Element)
      const normalizedColor = (color: string) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d') as CanvasRenderingContext2D
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      }

      return {
        maskBackground: normalizedColor(getComputedStyle(element.parentElement as Element).backgroundColor),
        dialogBackground: getComputedStyle(element).backgroundColor,
        headerBackground: style('.p-dialog-header').backgroundColor,
        contentBackground: style('.p-dialog-content').backgroundColor,
        footerBackground: style('.p-dialog-footer').backgroundColor,
        gridBackground: style('.compile-grid').backgroundColor,
        inputBackground: style('[aria-label="Export filename"]').backgroundColor,
        inputText: style('[aria-label="Export filename"]').color,
        primaryBackground: style('[aria-label="Compile download"]').backgroundColor,
        primaryText: style('[aria-label="Compile download"]').color,
        checkboxAccent: style('input[type="checkbox"]').accentColor,
        radioAccent: style('input[type="radio"]').accentColor,
      }
    })).toMatchObject({
      maskBackground: tokens.mask,
      dialogBackground: tokens.chrome,
      headerBackground: tokens.chrome,
      contentBackground: tokens.chrome,
      footerBackground: tokens.chrome,
      gridBackground: tokens.app,
      inputBackground: tokens.app,
      inputText: tokens.text,
      primaryBackground: tokens.focus,
      primaryText: tokens.app,
      checkboxAccent: tokens.focus,
      radioAccent: tokens.focus,
    })
  }
})

test('opens_compile_with_saved_copy_options_and_binder_order', async ({ page }) => {
  let compileRequest: Record<string, unknown> = {}
  await page.route('**/api/projects/*/compile', async (route) => {
    compileRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/epub+zip',
      headers: { 'content-disposition': `attachment; filename="export.epub"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.epub` },
      body: 'epub',
    })
  })
  await createProject(page, 'Compile Journey')
  await createDocument(page)
  await page.getByLabel('Document title').fill('Only Chapter')
  await page.getByLabel('Save document').click()
  await page.getByRole('button', { name: 'Compile' }).click()
  await page.getByText('Only Chapter', { exact: true }).last().click()
  await expect(page.getByLabel('Compile order')).toContainText('Only Chapter')
  await expect(page.getByLabel('Compile download')).toBeEnabled()
  await page.getByRole('radio', { name: 'E-reader' }).check()
  await page.getByRole('radio', { name: 'EPUB' }).check()
  await page.getByRole('radio', { name: 'IBM Plex Sans' }).check()
  await page.getByLabel('Export filename').fill('日本語')
  const downloadPromise = page.waitForEvent('download')
  await page.getByLabel('Compile download').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('日本語.epub')
  expect(compileRequest).toMatchObject({
    exportType: 'ereader',
    format: 'epub',
    font: 'sans-serif',
    sceneSeparator: '#',
    chapterPageBreaks: true,
  })
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe('epub')
})
