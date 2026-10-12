<script setup lang="ts">
import type { BinderItemDto } from '@pluma/shared'

defineProps<{ documents: BinderItemDto[] }>()
</script>

<template>
  <div aria-label="Compile order" class="compile-order">
    <strong>Order</strong>
    <ol>
      <li v-for="document in documents" :key="document.id">{{ document.title }}</li>
    </ol>
    <p v-if="documents.length === 0">Select a chapter or scene.</p>
  </div>
</template>
