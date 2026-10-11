<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  dirty: boolean
  mode?: 'take' | 'rename'
  initialName?: string
}>()
const emit = defineEmits<{
  close: []
  confirm: [name: string, saveFirst: boolean]
}>()
const name = ref('')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    name.value = props.initialName ?? ''
  },
)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="mode === 'rename' ? 'Rename Snapshot' : 'Take Snapshot'"
    :draggable="false"
    class="scr-dialog"
    @update:visible="!$event && emit('close')"
  >
    <p v-if="dirty && mode !== 'rename'" class="snapshot-warning">Save before taking a snapshot.</p>
    <label class="dialog-field">
      <span>Name (optional)</span>
      <InputText v-model="name" aria-label="Snapshot name" maxlength="200" autofocus />
    </label>
    <template #footer>
      <Button label="Cancel" text @click="emit('close')" />
      <Button
        v-if="mode === 'rename'"
        label="Rename"
        aria-label="Confirm rename snapshot"
        @click="emit('confirm', name.trim(), false)"
      />
      <Button
        v-else-if="dirty"
        label="Save and take"
        aria-label="Save and take snapshot"
        @click="emit('confirm', name.trim(), true)"
      />
      <Button
        v-else
        label="Take"
        aria-label="Confirm take snapshot"
        @click="emit('confirm', name.trim(), false)"
      />
    </template>
  </Dialog>
</template>
