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
  const scrollToCenter = (target: HTMLElement, behavior: ScrollBehavior): void => {
    const scroller = container.value
    if (!scroller) return
    const containerRect = scroller.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const top = targetRect.top + targetRect.height / 2 - (containerRect.top + containerRect.height / 2)
    if (Math.abs(top) < 1) return
    scroller.scrollBy({ top, behavior })
  }
  const center = (target: HTMLElement): void => {
    scrollToCenter(target, options.reducedMotion ? 'auto' : 'smooth')
  }
  const noteManualScroll = (): void => { manualScroll = true }
  const onKeyboardEdit = (target: HTMLElement): void => {
    if (manualScroll) manualScroll = false
    scrollToCenter(target, 'auto')
  }
  return { center, noteManualScroll, onKeyboardEdit }
}
