<script setup lang="ts">
const props = defineProps<{
  label: string
  value: number
  min: number
  max: number
  direction: 'normal' | 'reverse'
}>()
const emit = defineEmits<{ resize: [value: number] }>()

function handleKeydown(event: KeyboardEvent): void {
  const multiplier = props.direction === 'reverse' ? -1 : 1
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('resize', props.value - 12 * multiplier)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('resize', props.value + 12 * multiplier)
  } else if (event.key === 'Home') {
    event.preventDefault()
    emit('resize', props.min)
  } else if (event.key === 'End') {
    event.preventDefault()
    emit('resize', props.max)
  }
}

function beginPointerResize(event: PointerEvent): void {
  const startX = event.clientX
  const startValue = props.value
  const multiplier = props.direction === 'reverse' ? -1 : 1
  const move = (moveEvent: PointerEvent): void => {
    emit('resize', startValue + (moveEvent.clientX - startX) * multiplier)
  }
  const finish = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}
</script>

<template>
  <div
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    class="pane-resizer"
    @keydown="handleKeydown"
    @pointerdown="beginPointerResize"
  />
</template>
