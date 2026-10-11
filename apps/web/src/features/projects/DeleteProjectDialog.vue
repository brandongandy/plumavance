<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { computed, shallowRef, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  projectName: string
  busy: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const confirmation = shallowRef('')
const canDelete = computed(() => confirmation.value === props.projectName && !props.busy)

watch(
  () => props.visible,
  (visible) => {
    if (visible) confirmation.value = ''
  },
)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Delete project"
    :closable="!busy"
    :draggable="false"
    class="w-[min(28rem,calc(100vw-2rem))]"
    :pt="{
      root: { class: 'border border-[var(--color-border)] bg-[var(--color-chrome)] text-[var(--color-text)]' },
      header: { class: 'border-b border-[var(--color-border)] px-4 py-3 text-sm font-semibold' },
      content: { class: 'px-4 py-4' },
      footer: { class: 'flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3' },
      mask: { class: 'bg-[rgba(26,42,56,0.8)]' },
    }"
    @update:visible="emit('close')"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p>Type <strong>{{ projectName }}</strong> to permanently delete this project.</p>
      <InputText
        v-model="confirmation"
        autofocus
        autocomplete="off"
        aria-label="Type project name to confirm"
        class="h-11 w-full border border-[var(--color-border)] bg-[var(--color-editor)] px-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-focus)]"
      />
    </div>
    <template #footer>
      <Button
        label="Cancel"
        text
        class="h-11 px-3 text-sm text-[var(--color-text-soft)]"
        :disabled="busy"
        @click="emit('close')"
      />
      <Button
        label="Delete"
        class="h-11 bg-[var(--color-danger)] px-4 text-sm font-semibold text-[var(--color-app)] disabled:opacity-45"
        :disabled="!canDelete"
        :loading="busy"
        aria-label="Confirm delete project"
        @click="emit('confirm')"
      />
    </template>
  </Dialog>
</template>
