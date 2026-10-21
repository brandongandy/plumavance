<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef } from 'vue'

import type { SplitOrientation } from '../../stores/workspace.js'

const props = withDefaults(defineProps<{
  orientation: SplitOrientation
  value: number
  min?: number
  max?: number
}>(), { min: 0.2, max: 0.8 })
const emit = defineEmits<{ resize: [ratio: number] }>()
const separator = useTemplateRef<HTMLElement>('separator')
const ratio = computed(() => clamp(props.value))

let drag: { pointerId: number; origin: number; size: number; value: number; vertical: boolean } | null = null

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value))
}

function stopDrag(): void {
  drag = null
  window.removeEventListener('pointermove', movePointer)
  window.removeEventListener('pointerup', finishPointer)
  window.removeEventListener('pointercancel', finishPointer)
}

function movePointer(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return
  const position = drag.vertical ? event.clientX : event.clientY
  emit('resize', clamp(drag.value + (position - drag.origin) / drag.size))
}

function finishPointer(event: PointerEvent): void {
  if (event.pointerId === drag?.pointerId) stopDrag()
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || drag) return
  const bounds = separator.value?.parentElement?.getBoundingClientRect()
  const vertical = props.orientation === 'vertical'
  const size = vertical ? bounds?.width : bounds?.height
  if (!size) return
  event.preventDefault()
  separator.value?.focus()
  drag = {
    pointerId: event.pointerId,
    origin: vertical ? event.clientX : event.clientY,
    size,
    value: ratio.value,
    vertical,
  }
  window.addEventListener('pointermove', movePointer)
  window.addEventListener('pointerup', finishPointer)
  window.addEventListener('pointercancel', finishPointer)
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const decrease = props.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
  const increase = props.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
  let value: number
  if (event.key === 'Home') value = props.min
  else if (event.key === 'End') value = props.max
  else if (event.key === decrease) value = ratio.value - 0.05
  else if (event.key === increase) value = ratio.value + 0.05
  else return
  event.preventDefault()
  emit('resize', clamp(value))
}

onBeforeUnmount(stopDrag)
</script>

<template>
  <div
    ref="separator"
    role="separator"
    tabindex="0"
    aria-label="Resize split"
    :aria-orientation="orientation"
    :aria-valuemin="Math.round(min * 100)"
    :aria-valuemax="Math.round(max * 100)"
    :aria-valuenow="Math.round(ratio * 100)"
    class="editor-split-divider"
    :class="`editor-split-divider--${orientation}`"
    @pointerdown="startDrag"
    @keydown="resizeWithKeyboard"
  />
</template>
