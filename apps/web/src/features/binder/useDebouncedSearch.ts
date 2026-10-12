import { watch, type Ref } from 'vue'

export function useDebouncedSearch(
  query: Ref<string>,
  search: (query: string, signal: AbortSignal) => Promise<void>,
  delayMs = 250,
): void {
  watch(query, (value, _previous, onCleanup) => {
    const controller = new AbortController()

    if (!value.trim()) {
      onCleanup(() => controller.abort())
      void search('', controller.signal)
      return
    }

    const timer = setTimeout(() => {
      void search(value, controller.signal)
    }, delayMs)
    onCleanup(() => {
      controller.abort()
      clearTimeout(timer)
    })
  })
}
