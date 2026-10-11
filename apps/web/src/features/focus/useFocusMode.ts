import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useFocusMode(root: Ref<HTMLElement | null>): {
  isActive: Ref<boolean>
  enter: () => Promise<void>
  exit: () => Promise<void>
} {
  const isActive = ref(false)
  let usedBrowserFullscreen = false

  const exit = async (): Promise<void> => {
    isActive.value = false
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => undefined)
    usedBrowserFullscreen = false
  }
  const enter = async (): Promise<void> => {
    isActive.value = true
    usedBrowserFullscreen = false
    try {
      await root.value?.requestFullscreen?.()
      usedBrowserFullscreen = Boolean(document.fullscreenElement) || Boolean(root.value?.requestFullscreen)
    } catch {
      usedBrowserFullscreen = false
    }
  }
  const handleKeydown = (event: KeyboardEvent): void => {
    if (isActive.value && event.key === 'Escape') void exit()
  }
  const handleFullscreenChange = (): void => {
    if (isActive.value && usedBrowserFullscreen && !document.fullscreenElement) {
      isActive.value = false
      usedBrowserFullscreen = false
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    if (document.fullscreenElement) void document.exitFullscreen?.()
  })
  return { isActive, enter, exit }
}
