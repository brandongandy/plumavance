<script setup lang="ts">
import Button from 'primevue/button'
import { computed, nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue'

import { useTooltipGroup } from './tooltipGroup.js'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  tooltip: string
  icon?: string
  label?: string
  disabled?: boolean
  pressed?: boolean | undefined
  placement?: 'start' | 'center' | 'end'
}>(), {
  disabled: false,
  pressed: undefined,
  placement: 'center',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const group = useTooltipGroup()
const id = useId()
const tooltipId = `${id}-tooltip`
const visible = computed(() => group.activeId.value === id)
const anchor = useTemplateRef<HTMLElement>('anchor')
const tooltipElement = useTemplateRef<HTMLElement>('tooltip')
const tooltipPosition = shallowRef({ top: '0px', left: '0px' })

function updateTooltipPosition(): void {
  const bounds = anchor.value?.getBoundingClientRect()
  if (!bounds) return
  const width = tooltipElement.value?.getBoundingClientRect().width ?? 0
  const desiredLeft = props.placement === 'start'
    ? bounds.left
    : props.placement === 'end'
      ? bounds.right - width
      : bounds.left + (bounds.width - width) / 2
  const left = Math.min(Math.max(desiredLeft, 4), Math.max(4, window.innerWidth - width - 4))
  tooltipPosition.value = { top: `${bounds.bottom + 4}px`, left: `${left}px` }
}

function handleMouseEnter(): void {
  group.hover(id)
  void nextTick(updateTooltipPosition)
}

function handleFocusIn(): void {
  group.focus(id)
  void nextTick(updateTooltipPosition)
}

function releaseTooltip(): void {
  group.leave(id)
  group.blur(id)
}

function dismissOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') group.dismiss(id)
}

function scheduleTooltipPosition(): void {
  void nextTick(updateTooltipPosition)
}

function handleClick(event: MouseEvent): void {
  group.dismiss(id)
  emit('click', event)
}

watch(() => props.disabled, (disabled) => {
  if (disabled) releaseTooltip()
})
watch(visible, (isVisible, _wasVisible, onCleanup) => {
  if (!isVisible) return
  window.addEventListener('keydown', dismissOnEscape)
  window.addEventListener('resize', scheduleTooltipPosition)
  window.addEventListener('scroll', scheduleTooltipPosition, true)
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(scheduleTooltipPosition)
  if (anchor.value) resizeObserver?.observe(anchor.value)
  onCleanup(() => {
    window.removeEventListener('keydown', dismissOnEscape)
    window.removeEventListener('resize', scheduleTooltipPosition)
    window.removeEventListener('scroll', scheduleTooltipPosition, true)
    resizeObserver?.disconnect()
  })
})
onBeforeUnmount(releaseTooltip)
</script>

<template>
  <span
    ref="anchor"
    class="tooltip-button"
    :class="`tooltip-button--${placement}`"
    @mouseenter="handleMouseEnter"
    @mouseleave="group.leave(id)"
    @focusin="handleFocusIn"
    @focusout="group.blur(id)"
    @keydown.esc.stop="group.dismiss(id)"
  >
    <Button
      v-bind="$attrs"
      :icon="icon"
      :label="label"
      text
      :aria-describedby="visible ? tooltipId : undefined"
      :aria-pressed="pressed"
      :disabled="disabled"
      @click="handleClick"
    />
    <span
      v-if="visible"
      :id="tooltipId"
      ref="tooltip"
      role="tooltip"
      class="tooltip-button__tooltip"
      :style="tooltipPosition"
    >{{ tooltip }}</span>
  </span>
</template>

<style scoped>
.tooltip-button {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tooltip-button__tooltip {
  position: fixed;
  z-index: 40;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-chrome);
  padding: 6px 8px;
  color: var(--color-text);
  font-family: var(--font-code);
  font-size: 11px;
  line-height: 1;
  pointer-events: auto;
  white-space: nowrap;
}

.tooltip-button__tooltip::before {
  position: absolute;
  top: -5px;
  left: 0;
  width: 100%;
  height: 5px;
  content: '';
}
</style>
