import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export type EditorFont = 'serif' | 'sans-serif' | 'monospace'
export type ThemeId =
  | 'helion-dark'
  | 'helion-light'
  | 'solarized-light'
  | 'solarized-dark'
  | 'dracula'
  | 'catppuccin'
  | 'synthwave-84'
  | 'terminal'

export interface AppearancePreferences {
  editorFont: EditorFont
  theme: ThemeId
}

export interface ThemeOption {
  id: ThemeId
  label: string
  swatches: readonly [string, string, string]
}

export const editorFontOptions: ReadonlyArray<{ id: EditorFont; label: string }> = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans-serif', label: 'Sans serif' },
  { id: 'monospace', label: 'Monospace' },
]

export const themeOptions: readonly ThemeOption[] = [
  { id: 'helion-dark', label: 'Helion Dark', swatches: ['#1a2a38', '#2d4354', '#40abe5'] },
  { id: 'helion-light', label: 'Helion Light', swatches: ['#f1f3ef', '#ffffff', '#006b96'] },
  { id: 'solarized-light', label: 'Solarized Light', swatches: ['#fdf6e3', '#eee8d5', '#006b7f'] },
  { id: 'solarized-dark', label: 'Solarized Dark', swatches: ['#002b36', '#073642', '#2aa198'] },
  { id: 'dracula', label: 'Dracula', swatches: ['#282a36', '#44475a', '#bd93f9'] },
  { id: 'catppuccin', label: 'Catppuccin', swatches: ['#11111b', '#1e1e2e', '#b4befe'] },
  { id: 'synthwave-84', label: "Synthwave '84", swatches: ['#262335', '#34294f', '#ff7edb'] },
  { id: 'terminal', label: 'Terminal', swatches: ['#090704', '#171008', '#ff9d2e'] },
]

const preferenceKey = 'pluma.appearance.preferences'
const defaultPreferences: AppearancePreferences = { editorFont: 'serif', theme: 'helion-dark' }
const editorFonts = new Set<EditorFont>(editorFontOptions.map((option) => option.id))
const themes = new Set<ThemeId>(themeOptions.map((option) => option.id))
const darkThemes = new Set<ThemeId>([
  'helion-dark',
  'solarized-dark',
  'dracula',
  'catppuccin',
  'synthwave-84',
  'terminal',
])

function loadPreferences(): AppearancePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Partial<AppearancePreferences>
    return {
      editorFont: editorFonts.has(value.editorFont as EditorFont) ? value.editorFont as EditorFont : defaultPreferences.editorFont,
      theme: themes.has(value.theme as ThemeId) ? value.theme as ThemeId : defaultPreferences.theme,
    }
  } catch {
    return { ...defaultPreferences }
  }
}

function applyPreferences(preferences: AppearancePreferences): void {
  const root = document.documentElement
  const dark = darkThemes.has(preferences.theme)
  root.dataset.theme = preferences.theme
  root.dataset.editorFont = preferences.editorFont
  root.classList.toggle('pluma-dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = loadPreferences()
  const editorFont = shallowRef<EditorFont>(initial.editorFont)
  const theme = shallowRef<ThemeId>(initial.theme)

  applyPreferences(initial)

  function preview(preferences: AppearancePreferences): void {
    editorFont.value = preferences.editorFont
    theme.value = preferences.theme
    applyPreferences(preferences)
  }

  function save(): boolean {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ editorFont: editorFont.value, theme: theme.value }))
      return true
    } catch {
      return false
    }
  }

  return { editorFont, theme, preview, save }
})
