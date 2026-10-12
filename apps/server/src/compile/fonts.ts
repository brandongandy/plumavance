import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import type { EreaderFont } from '@pluma/shared'

const require = createRequire(import.meta.url)

interface FontDefinition {
  family: string
  fallback: string
  packageName: string
  fileStem: string
}

export interface FontAsset {
  path: string
  filename: string
}

export interface BundledFont {
  family: string
  css: string
  assets: FontAsset[]
}

const fonts: Record<EreaderFont, FontDefinition> = {
  monospace: {
    family: 'IBM Plex Mono',
    fallback: 'monospace',
    packageName: '@fontsource/ibm-plex-mono',
    fileStem: 'ibm-plex-mono',
  },
  serif: {
    family: 'Literata',
    fallback: 'serif',
    packageName: '@fontsource/literata',
    fileStem: 'literata',
  },
  'sans-serif': {
    family: 'IBM Plex Sans',
    fallback: 'sans-serif',
    packageName: '@fontsource/ibm-plex-sans',
    fileStem: 'ibm-plex-sans',
  },
}

const cache = new Map<string, BundledFont>()

function asset(definition: FontDefinition, weight: 400 | 700, style: 'normal' | 'italic'): FontAsset {
  const filename = `${definition.fileStem}-latin-${weight}-${style}.woff2`
  return {
    path: require.resolve(`${definition.packageName}/files/${filename}`),
    filename,
  }
}

export function bundledFont(font: EreaderFont, mode: 'embedded' | 'linked' = 'embedded'): BundledFont {
  const cacheKey = `${font}:${mode}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const definition = fonts[font]
  const assets = [asset(definition, 400, 'normal'), asset(definition, 400, 'italic'), asset(definition, 700, 'normal'), asset(definition, 700, 'italic')]
  const css = assets.map((fontAsset, index) => {
    const weight = index < 2 ? 400 : 700
    const style = index % 2 === 0 ? 'normal' : 'italic'
    const source = mode === 'embedded'
      ? `data:font/woff2;base64,${readFileSync(fontAsset.path).toString('base64')}`
      : `../fonts/${fontAsset.filename}`
    return `@font-face{font-family:'${definition.family}';font-style:${style};font-weight:${weight};src:url(${source}) format('woff2')}`
  }).join('')
  const bundle = {
    family: `'${definition.family}',${definition.fallback}`,
    css,
    assets,
  }
  cache.set(cacheKey, bundle)
  return bundle
}
