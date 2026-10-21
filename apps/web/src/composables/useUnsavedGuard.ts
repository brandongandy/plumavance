import { inject, onBeforeUnmount, onMounted, provide, type InjectionKey } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const promptMessage = 'You have unsaved changes. Discard them and continue?'

export interface UnsavedGuard {
  canDiscard: (documentIds?: readonly string[]) => boolean
  runGuarded: <T>(action: () => T, documentIds?: readonly string[]) => T | undefined
}

export const UnsavedGuardKey: InjectionKey<UnsavedGuard> = Symbol('UnsavedGuard')

export function useUnsavedGuard(
  isDirty: (documentIds?: readonly string[]) => boolean,
  confirmDiscard: () => boolean = () => window.confirm(promptMessage),
): UnsavedGuard {
  const canDiscard = (documentIds?: readonly string[]): boolean => !isDirty(documentIds) || confirmDiscard()
  const runGuarded = <T>(action: () => T, documentIds?: readonly string[]): T | undefined =>
    canDiscard(documentIds) ? action() : undefined

  const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
  onBeforeRouteLeave(() => canDiscard())

  const guard = { canDiscard, runGuarded }
  provide(UnsavedGuardKey, guard)
  return guard
}

export function useProvidedUnsavedGuard(): UnsavedGuard {
  return inject(UnsavedGuardKey, {
    canDiscard: () => true,
    runGuarded: <T>(action: () => T): T => action(),
  })
}
