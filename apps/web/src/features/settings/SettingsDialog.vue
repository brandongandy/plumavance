<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

import {
  editorFontOptions,
  themeOptions,
  type AppearancePreferences,
  type EditorFont,
  type ThemeId,
  useSettingsStore,
} from '../../stores/settings.js'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useSettingsStore()
const original = shallowRef<AppearancePreferences>({ editorFont: store.editorFont, theme: store.theme })
const editorFont = shallowRef<EditorFont>(store.editorFont)
const theme = shallowRef<ThemeId>(store.theme)
const formError = shallowRef('')
let transactionOpen = false

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    original.value = { editorFont: store.editorFont, theme: store.theme }
    editorFont.value = store.editorFont
    theme.value = store.theme
    formError.value = ''
    transactionOpen = true
  },
)

function preview(): void {
  formError.value = ''
  store.preview({ editorFont: editorFont.value, theme: theme.value })
}

function selectFont(value: EditorFont): void {
  editorFont.value = value
  preview()
}

function selectTheme(value: ThemeId): void {
  theme.value = value
  preview()
}

function cancel(): void {
  store.preview(original.value)
  transactionOpen = false
  emit('close')
}

function save(): void {
  if (!store.save()) {
    formError.value = 'Appearance settings could not be saved. Check browser storage permissions and try again.'
    return
  }
  transactionOpen = false
  emit('close')
}

onBeforeUnmount(() => {
  if (transactionOpen) store.preview(original.value)
})
</script>

<template>
  <Dialog
    :visible="visible"
    append-to="self"
    modal
    header="Settings"
    :draggable="false"
    class="settings-dialog"
    :pt="{ mask: { class: 'settings-dialog-mask' } }"
    @update:visible="!$event && cancel()"
  >
    <fieldset class="settings-section">
      <legend>Editor font</legend>
      <div class="settings-font-options">
        <label v-for="option in editorFontOptions" :key="option.id" :class="`font-choice font-choice--${option.id}`">
          <input
            type="radio"
            name="editor-font"
            :value="option.id"
            :checked="editorFont === option.id"
            @change="selectFont(option.id)"
          >
          <span aria-hidden="true">Aa</span>
          {{ option.label }}
        </label>
      </div>
    </fieldset>

    <fieldset class="settings-section">
      <legend>Theme</legend>
      <div class="settings-theme-options">
        <label v-for="option in themeOptions" :key="option.id" class="theme-choice">
          <input
            type="radio"
            name="theme"
            :value="option.id"
            :checked="theme === option.id"
            @change="selectTheme(option.id)"
          >
          <span class="theme-swatches" aria-hidden="true">
            <span v-for="swatch in option.swatches" :key="swatch" :style="{ backgroundColor: swatch }" />
          </span>
          <span>{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <p v-if="formError" role="alert" class="settings-error">{{ formError }}</p>

    <template #footer>
      <Button label="Cancel" text aria-label="Cancel settings changes" @click="cancel" />
      <Button label="Done" aria-label="Save settings" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.settings-section {
  margin: 0;
  border: 0;
  padding: 0;
}

.settings-section + .settings-section {
  margin-top: 16px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

.settings-error {
  margin: 12px 0 0;
  border-top: 1px solid var(--color-danger);
  padding-top: 8px;
  color: var(--color-danger);
  font-size: 12px;
}

.settings-section legend {
  margin-bottom: 7px;
  padding: 0;
  color: var(--color-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.settings-font-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  border: 1px solid var(--color-border);
  background: var(--color-border);
}

.font-choice,
.theme-choice {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--color-app);
  color: var(--color-text-soft);
  cursor: pointer;
}

.font-choice {
  min-height: 42px;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
}

.font-choice:has(input:checked),
.theme-choice:has(input:checked) {
  background: color-mix(in srgb, var(--color-focus) 18%, var(--color-app));
  color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-focus);
}

.font-choice span {
  font-size: 17px;
}

.font-choice--serif span {
  font-family: var(--font-prose);
}

.font-choice--sans-serif span {
  font-family: var(--font-ui);
}

.font-choice--monospace span {
  font-family: var(--font-code);
}

.settings-theme-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.theme-choice {
  min-height: 38px;
  gap: 9px;
  border: 1px solid var(--color-border);
  padding: 0 8px;
  font-size: 12px;
}

.font-choice input,
.theme-choice input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.font-choice:focus-within,
.theme-choice:focus-within {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
}

.theme-swatches {
  display: flex;
  width: 36px;
  height: 16px;
  flex: none;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-text) 24%, transparent);
}

.theme-swatches span {
  flex: 1;
}

:global(.settings-dialog) {
  width: min(500px, calc(100vw - 24px));
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-chrome);
  color: var(--color-text);
  box-shadow: 0 14px 38px color-mix(in srgb, #000 34%, transparent);
}

:global(.settings-dialog .p-dialog-header) {
  border-bottom: 1px solid var(--color-border);
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
}

:global(.settings-dialog .p-dialog-content) {
  padding: 14px 12px;
  background: var(--color-chrome);
  color: var(--color-text);
}

:global(.settings-dialog .p-dialog-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  border-top: 1px solid var(--color-border);
  padding: 8px 12px;
}

:global(.settings-dialog .p-dialog-footer button) {
  min-height: 32px;
  padding: 0 12px;
  color: var(--color-text-soft);
  font-size: 12px;
}

:global(.settings-dialog .p-dialog-footer button:last-child) {
  background: var(--color-focus);
  color: var(--color-app);
  font-weight: 600;
}

:global(.settings-dialog .p-dialog-close-button) {
  width: 32px;
  height: 32px;
  color: var(--color-muted);
}

:global(.settings-dialog-mask) {
  background: color-mix(in srgb, var(--color-app) 80%, transparent);
}

@media (max-width: 480px) {
  .settings-theme-options {
    grid-template-columns: 1fr;
  }
}

@media (pointer: coarse) {
  .font-choice,
  .theme-choice,
  :global(.settings-dialog .p-dialog-footer button) {
    min-height: 44px;
  }
}
</style>
