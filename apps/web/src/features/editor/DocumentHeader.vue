<script setup lang="ts">
defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <header class="document-header">
    <input
      :value="modelValue"
      :disabled="disabled"
      aria-label="Document title"
      maxlength="300"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </header>
</template>
