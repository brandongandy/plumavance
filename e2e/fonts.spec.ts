import { expect, test } from '@playwright/test'

test('bundles_the_font_faces_used_by_the_interface', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)

  const typography = await page.evaluate(() => ({
    bodyFamily: getComputedStyle(document.body).fontFamily,
    faces: [...document.fonts].map((face) => ({
      family: face.family,
      style: face.style,
      weight: face.weight,
    })),
  }))

  expect(typography.bodyFamily).toContain('IBM Plex Sans')
  expect(typography.faces).toEqual(expect.arrayContaining([
    expect.objectContaining({ family: 'IBM Plex Sans', style: 'normal', weight: '400' }),
    expect.objectContaining({ family: 'IBM Plex Sans', style: 'italic', weight: '400' }),
    expect.objectContaining({ family: 'IBM Plex Sans', style: 'normal', weight: '700' }),
    expect.objectContaining({ family: 'IBM Plex Mono', style: 'normal', weight: '400' }),
    expect.objectContaining({ family: 'Literata', style: 'italic', weight: '400' }),
    expect.objectContaining({ family: 'Literata', style: 'normal', weight: '700' }),
  ]))
})
