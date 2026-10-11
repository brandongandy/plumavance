<script setup lang="ts">
import type { ProjectDto } from '@scr/shared'
import Button from 'primevue/button'

defineProps<{
  projects: ProjectDto[]
}>()

const emit = defineEmits<{
  open: [project: ProjectDto]
  rename: [project: ProjectDto, trigger: HTMLElement]
  delete: [project: ProjectDto, trigger: HTMLElement]
}>()

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

function triggerElement(event: Event): HTMLElement {
  return event.currentTarget as HTMLElement
}
</script>

<template>
  <div class="overflow-x-auto border-y border-[var(--color-border)]">
    <table class="w-full border-collapse text-left text-[0.8125rem]" aria-label="Projects">
      <thead class="bg-[var(--color-chrome)] text-[var(--color-muted)]">
        <tr>
          <th class="h-8 px-3 font-medium">Name</th>
          <th class="h-8 px-3 font-medium">Last opened</th>
          <th class="h-8 w-24 px-2 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="project in projects"
          :key="project.id"
          data-project-row
          class="border-t border-[var(--color-border)] bg-[var(--color-editor)] hover:bg-[var(--color-chrome)]"
        >
          <td class="px-3 py-0">
            <button
              type="button"
              class="min-h-11 w-full text-left font-medium text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus)]"
              :aria-label="`Open ${project.name}`"
              @click="emit('open', project)"
            >
              {{ project.name }}
            </button>
          </td>
          <td class="px-3 font-mono text-xs text-[var(--color-muted)]">
            {{ formatDate(project.lastOpenedAt) }}
          </td>
          <td class="px-1 text-right">
            <Button
              text
              icon="pi pi-pencil"
              class="h-11 w-11 text-[var(--color-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
              :aria-label="`Rename ${project.name}`"
              @click="emit('rename', project, triggerElement($event))"
            />
            <Button
              text
              icon="pi pi-trash"
              class="h-11 w-11 text-[var(--color-muted)] hover:text-[var(--color-danger)] focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
              :aria-label="`Delete ${project.name}`"
              @click="emit('delete', project, triggerElement($event))"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
