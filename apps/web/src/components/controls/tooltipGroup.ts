import { computed, inject, provide, shallowRef, type ComputedRef, type InjectionKey } from 'vue'

interface TooltipGroup {
  activeId: ComputedRef<string | null>
  focus: (id: string) => void
  blur: (id: string) => void
  hover: (id: string) => void
  leave: (id: string) => void
  dismiss: (id: string) => void
}

const TooltipGroupKey: InjectionKey<TooltipGroup> = Symbol('tooltip-group')

function createTooltipGroup(): TooltipGroup {
  const hoveredId = shallowRef<string | null>(null)
  const focusedId = shallowRef<string | null>(null)
  const dismissedId = shallowRef<string | null>(null)

  return {
    activeId: computed(() => {
      const candidate = hoveredId.value ?? focusedId.value
      return candidate === dismissedId.value ? null : candidate
    }),
    focus(id) {
      dismissedId.value = null
      focusedId.value = id
    },
    blur(id) {
      if (focusedId.value === id) focusedId.value = null
    },
    hover(id) {
      dismissedId.value = null
      hoveredId.value = id
    },
    leave(id) {
      if (hoveredId.value === id) hoveredId.value = null
    },
    dismiss(id) {
      dismissedId.value = id
    },
  }
}

export function provideTooltipGroup(): void {
  provide(TooltipGroupKey, createTooltipGroup())
}

export function useTooltipGroup(): TooltipGroup {
  return inject(TooltipGroupKey, createTooltipGroup())
}
