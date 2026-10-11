<script setup lang="ts">
import Button from 'primevue/button'

const emit = defineEmits<{ exit: [] }>()
</script>

<template>
  <Button label="Exit Focus" icon="pi pi-compress" class="focus-exit-button" aria-label="Exit focus mode" @click="emit('exit')" />
</template>
