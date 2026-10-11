<script setup lang="ts">
defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="document-notes">
    <span class="sr-only">Document notes</span>
    <textarea
      :value="modelValue"
      :disabled="disabled"
      maxlength="500000"
      aria-label="Document notes"
      placeholder="Notes"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>
