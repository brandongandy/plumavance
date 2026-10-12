import { ref } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import { useTypewriterScroll } from '../src/features/focus/useTypewriterScroll.js'

describe('typewriter scrolling', () => {
  test('focus_mode_css_provides_scroll_space_at_both_document_boundaries', async () => {
    const css = await readFile('src/styles/app.css', 'utf8')
    expect(css).toMatch(/\.workspace-shell\.is-focus-mode \.document-scroll[\s\S]*padding-block:\s*50vh/)
  })

  test('centers_the_active_block_and_uses_immediate_motion_when_reduced', () => {
    const container = document.createElement('div')
    const target = document.createElement('p')
    container.append(target)
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 700, height: 600, left: 0, right: 0, width: 0, x: 0, y: 100, toJSON: () => ({}) })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 500, bottom: 540, height: 40, left: 0, right: 0, width: 0, x: 0, y: 500, toJSON: () => ({}) })
    const scrollBy = vi.fn(); Object.defineProperty(container, 'scrollBy', { value: scrollBy })
    const typewriter = useTypewriterScroll(ref(container), { reducedMotion: true })
    typewriter.center(target)
    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'auto' })
  })

  test('restarts_after_manual_scroll_without_animating_each_keyboard_edit', () => {
    const container = document.createElement('div'); const target = document.createElement('p'); container.append(target)
    const scrollBy = vi.fn(); Object.defineProperty(container, 'scrollBy', { value: scrollBy })
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 600, height: 600, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 400, bottom: 440, height: 40, left: 0, right: 0, width: 0, x: 0, y: 400, toJSON: () => ({}) })
    const typewriter = useTypewriterScroll(ref(container), { reducedMotion: false })
    typewriter.noteManualScroll(); expect(scrollBy).not.toHaveBeenCalled()
    typewriter.onKeyboardEdit(target); expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'auto' })
  })

  test('ignores_subpixel_keyboard_recentering_that_would_make_text_bounce', () => {
    const container = document.createElement('div'); const target = document.createElement('p'); container.append(target)
    const scrollBy = vi.fn(); Object.defineProperty(container, 'scrollBy', { value: scrollBy })
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 600, height: 600, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 279.75, bottom: 319.75, height: 40, left: 0, right: 0, width: 0, x: 0, y: 279.75, toJSON: () => ({}) })
    const typewriter = useTypewriterScroll(ref(container), { reducedMotion: false })

    typewriter.onKeyboardEdit(target)

    expect(scrollBy).not.toHaveBeenCalled()
  })
})
