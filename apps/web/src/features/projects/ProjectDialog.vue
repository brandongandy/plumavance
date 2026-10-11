<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { computed, shallowRef, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'rename'
  initialName: string | undefined
  busy: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [name: string]
}>()

const name = shallowRef('')
const title = computed(() => (props.mode === 'create' ? 'Create project' : 'Rename project'))
const normalizedName = computed(() => name.value.trim())
const canSubmit = computed(() => normalizedName.value.length > 0 && !props.busy)

watch(
  () => props.visible,
  (visible) => {
    if (visible) name.value = props.initialName ?? ''
  },
)

function handleSubmit(): void {
  if (canSubmit.value) emit('submit', normalizedName.value)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    :closable="!busy"
    :draggable="false"
    class="w-[min(26rem,calc(100vw-2rem))]"
    :pt="{
      root: { class: 'border border-[var(--color-border)] bg-[var(--color-chrome)] text-[var(--color-text)]' },
      header: { class: 'border-b border-[var(--color-border)] px-4 py-3 text-sm font-semibold' },
      content: { class: 'px-4 py-4' },
      footer: { class: 'flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3' },
      mask: { class: 'bg-[rgba(26,42,56,0.8)]' },
    }"
    @update:visible="emit('close')"
  >
    <form class="flex flex-col gap-2" @submit.prevent="handleSubmit">
      <label for="project-name" class="text-xs font-medium text-[var(--color-text-soft)]">Project name</label>
      <InputText
        id="project-name"
        v-model="name"
        autofocus
        autocomplete="off"
        aria-label="Project name"
        class="h-11 w-full border border-[var(--color-border)] bg-[var(--color-editor)] px-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-focus)]"
      />
    </form>
    <template #footer>
      <Button
        label="Cancel"
        text
        class="h-11 px-3 text-sm text-[var(--color-text-soft)]"
        :disabled="busy"
        @click="emit('close')"
      />
      <Button
        :label="mode === 'create' ? 'Create' : 'Rename'"
        class="h-11 bg-[var(--color-focus)] px-4 text-sm font-semibold text-[var(--color-app)] disabled:opacity-45"
        :disabled="!canSubmit"
        :loading="busy"
        :aria-label="mode === 'create' ? 'Confirm create project' : 'Confirm rename project'"
        @click="handleSubmit"
      />
    </template>
  </Dialog>
</template>
