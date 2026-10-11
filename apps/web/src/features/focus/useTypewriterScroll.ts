import type { Ref } from 'vue'

export function useTypewriterScroll(
  container: Ref<HTMLElement | null>,
  options: { reducedMotion: boolean },
): {
  center: (target: HTMLElement) => void
  noteManualScroll: () => void
  onKeyboardEdit: (target: HTMLElement) => void
} {
  let manualScroll = false
  const center = (target: HTMLElement): void => {
    const scroller = container.value
    if (!scroller) return
    const containerRect = scroller.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const top = targetRect.top + targetRect.height / 2 - (containerRect.top + containerRect.height / 2)
    scroller.scrollBy({ top, behavior: options.reducedMotion ? 'auto' : 'smooth' })
  }
  const noteManualScroll = (): void => { manualScroll = true }
  const onKeyboardEdit = (target: HTMLElement): void => {
    if (manualScroll) manualScroll = false
    center(target)
  }
  return { center, noteManualScroll, onKeyboardEdit }
}
