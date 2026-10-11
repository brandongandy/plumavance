<script setup lang="ts">
import type { BinderItemDto } from '@scr/shared'

defineProps<{ documents: BinderItemDto[] }>()
</script>

<template>
  <div aria-label="Compile order" class="compile-order">
    <strong>Order</strong>
    <ol>
      <li v-for="document in documents" :key="document.id">{{ document.title }}</li>
    </ol>
    <p v-if="documents.length === 0">Select a folder or document.</p>
  </div>
</template>
