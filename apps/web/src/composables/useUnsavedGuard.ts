import { inject, onBeforeUnmount, onMounted, provide, type InjectionKey } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const promptMessage = 'You have unsaved changes. Discard them and continue?'

export interface UnsavedGuard {
  canTransition: () => boolean
  runGuarded: <T>(action: () => T) => T | undefined
}

export const UnsavedGuardKey: InjectionKey<UnsavedGuard> = Symbol('UnsavedGuard')

export function useUnsavedGuard(
  isDirty: () => boolean,
  confirmDiscard: () => boolean = () => window.confirm(promptMessage),
): UnsavedGuard {
  const canTransition = (): boolean => !isDirty() || confirmDiscard()
  const runGuarded = <T>(action: () => T): T | undefined =>
    canTransition() ? action() : undefined

  const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
  onBeforeRouteLeave(() => canTransition())

  const guard = { canTransition, runGuarded }
  provide(UnsavedGuardKey, guard)
  return guard
}

export function useProvidedUnsavedGuard(): UnsavedGuard {
  return inject(UnsavedGuardKey, {
    canTransition: () => true,
    runGuarded: <T>(action: () => T): T => action(),
  })
}
