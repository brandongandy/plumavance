<script setup lang="ts">
import type { BinderItemDto } from '@pluma/shared'

defineProps<{ documents: BinderItemDto[]; wordCount: number; counting: boolean; countError: string }>()
</script>

<template>
  <div aria-label="Compile order" class="compile-order">
    <div class="compile-order-heading">
      <strong>Order</strong>
      <span v-if="!countError" aria-label="Compile word count" role="status">{{ counting ? 'Counting…' : `${wordCount.toLocaleString()} words` }}</span>
    </div>
    <p v-if="countError" role="alert" class="compile-count-error">{{ countError }}</p>
    <ol>
      <li v-for="document in documents" :key="document.id">{{ document.title }}</li>
    </ol>
    <p v-if="documents.length === 0">Select a chapter or scene.</p>
  </div>
</template>
