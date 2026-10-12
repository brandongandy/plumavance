<script setup lang="ts">
import { UpdateWritingSettingsRequestSchema, type DailyCountMode } from '@pluma/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue'

import { useWritingProgressStore } from '../../stores/writing-progress.js'

const props = defineProps<{ projectWords: number }>()
const store = useWritingProgressStore()
const id = useId()
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const projectInput = useTemplateRef<HTMLInputElement>('projectInput')
const open = shallowRef(false)
const hovered = shallowRef(false)
const focused = shallowRef(false)
const projectTarget = shallowRef('')
const dailyTarget = shallowRef('')
const countMode = shallowRef<DailyCountMode>('additions')
const busy = shallowRef(false)
const formError = shallowRef('')
const tooltip = computed(() => `${props.projectWords.toLocaleString('en-US')} words | ${store.dailyWordCount.toLocaleString('en-US')} words`)
const progressValue = computed(() => store.dailyWordTarget === null ? 0 : Math.min(store.dailyWordTarget, Math.max(0, store.dailyWordCount)))
const fillWidth = computed(() => store.dailyWordTarget === null ? '0%' : `${progressValue.value * 100 / store.dailyWordTarget}%`)
const syncText = computed(() => store.syncState === 'failed' ? 'Not synced' : store.syncState === 'syncing' ? 'Syncing…' : 'Synced')

async function toggleSettings(): Promise<void> {
  if (open.value) { await close(); return }
  projectTarget.value = store.projectWordTarget?.toString() ?? ''
  dailyTarget.value = store.dailyWordTarget?.toString() ?? ''
  countMode.value = store.dailyCountMode
  formError.value = ''
  open.value = true
  await nextTick()
  projectInput.value?.focus()
}

async function close(restoreFocus = true): Promise<void> {
  open.value = false
  if (restoreFocus) {
    await nextTick()
    trigger.value?.focus()
  }
}

function targetValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)) || Number(trimmed) <= 0) {
    throw new Error('Targets must be a positive whole number, or left empty.')
  }
  return Number(trimmed)
}

async function saveSettings(): Promise<void> {
  if (busy.value) return
  formError.value = ''
  try {
    const input = UpdateWritingSettingsRequestSchema.parse({
      projectWordTarget: targetValue(projectTarget.value),
      dailyWordTarget: targetValue(dailyTarget.value),
      dailyCountMode: countMode.value,
    })
    busy.value = true
    await store.updateSettings(input)
    await close()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Writing settings could not be saved.'
  } finally {
    busy.value = false
  }
}

function outsidePointer(event: PointerEvent): void {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) void close(false)
}

function leaveFocus(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) void close(false)
}

function handleEscape(event: KeyboardEvent): void {
  if (!open.value) return
  event.stopPropagation()
  event.preventDefault()
  void close()
}

onMounted(() => document.addEventListener('pointerdown', outsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outsidePointer))
</script>

<template>
  <div ref="root" class="writing-progress-control" @keydown.esc="handleEscape" @focusout="leaveFocus">
    <div class="writing-progress-anchor">
      <button
        ref="trigger"
        type="button"
        class="writing-progress-trigger"
        aria-label="Writing progress settings"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-controls="open ? `${id}-settings` : undefined"
        :aria-describedby="hovered || focused ? `${id}-tooltip` : undefined"
        @click="toggleSettings"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @focus="focused = true"
        @blur="focused = false"
      >
        <span
          class="writing-progress-track"
          :role="store.dailyWordTarget === null ? 'img' : 'progressbar'"
          :aria-label="store.dailyWordTarget === null ? 'Daily word target not set' : 'Daily writing progress'"
          :aria-valuemin="store.dailyWordTarget === null ? undefined : 0"
          :aria-valuemax="store.dailyWordTarget ?? undefined"
          :aria-valuenow="store.dailyWordTarget === null ? undefined : progressValue"
          :aria-valuetext="store.dailyWordTarget === null ? undefined : tooltip"
        ><span class="writing-progress-fill" :style="{ width: fillWidth }" /></span>
      </button>
      <span v-if="hovered || focused" :id="`${id}-tooltip`" role="tooltip" class="writing-progress-tooltip">{{ tooltip }}</span>
      <section v-if="open" :id="`${id}-settings`" role="dialog" :aria-labelledby="`${id}-heading`" class="writing-progress-popover">
        <strong :id="`${id}-heading`">Writing progress</strong>
        <p class="writing-progress-hint">Project: {{ props.projectWords.toLocaleString('en-US') }} words · Today: {{ store.dailyWordCount.toLocaleString('en-US') }} words</p>
        <form class="writing-progress-form" @submit.prevent="saveSettings">
          <label :for="`${id}-project`">Project word target</label>
          <input :id="`${id}-project`" ref="projectInput" v-model="projectTarget" aria-label="Project word target" inputmode="numeric" type="text" :disabled="busy" :aria-describedby="`${id}-hint`" />
          <label :for="`${id}-daily`">Daily word target</label>
          <input :id="`${id}-daily`" v-model="dailyTarget" aria-label="Daily word target" inputmode="numeric" type="text" :disabled="busy" :aria-describedby="`${id}-hint`" />
          <span :id="`${id}-hint`" class="writing-progress-hint">Leave empty to clear a target.</span>
          <label :for="`${id}-mode`">Daily count mode</label>
          <select :id="`${id}-mode`" v-model="countMode" aria-label="Daily count mode" :disabled="busy">
            <option value="additions">Additions</option>
            <option value="net">Net</option>
          </select>
          <p class="writing-progress-sync" role="status">{{ syncText }}</p>
          <p v-if="formError || store.errorMessage" role="alert" class="writing-progress-error">{{ formError || store.errorMessage }}</p>
          <div class="writing-progress-actions">
            <button type="button" :disabled="busy" @click="close()">Cancel</button>
            <button type="submit" aria-label="Save writing settings" :disabled="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </section>
    </div>
    <button type="button" role="switch" aria-label="Edit Mode" :aria-checked="store.editMode" class="writing-edit-mode" :class="{ 'is-enabled': store.editMode }" @click="store.setEditMode(!store.editMode)">Edit Mode</button>
  </div>
</template>
