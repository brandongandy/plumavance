<script setup lang="ts">
import type { ProjectDto } from '@scr/shared'
import Button from 'primevue/button'
import { nextTick, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import { projectApi } from '../api/projects.js'
import DeleteProjectDialog from '../features/projects/DeleteProjectDialog.vue'
import ProjectDialog from '../features/projects/ProjectDialog.vue'
import ProjectList from '../features/projects/ProjectList.vue'

const router = useRouter()
const projects = shallowRef<ProjectDto[]>([])
const loading = shallowRef(true)
const busy = shallowRef(false)
const errorMessage = shallowRef('')
const projectDialogVisible = shallowRef(false)
const projectDialogMode = shallowRef<'create' | 'rename'>('create')
const selectedProject = shallowRef<ProjectDto | null>(null)
const deleteDialogVisible = shallowRef(false)
const returnFocus = shallowRef<HTMLElement | null>(null)

async function loadProjects(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    projects.value = await projectApi.list()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load projects.'
  } finally {
    loading.value = false
  }
}

function openCreate(event?: Event): void {
  projectDialogMode.value = 'create'
  selectedProject.value = null
  returnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  projectDialogVisible.value = true
}

function openRename(project: ProjectDto, trigger: HTMLElement): void {
  projectDialogMode.value = 'rename'
  selectedProject.value = project
  returnFocus.value = trigger
  projectDialogVisible.value = true
}

function openDelete(project: ProjectDto, trigger: HTMLElement): void {
  selectedProject.value = project
  returnFocus.value = trigger
  deleteDialogVisible.value = true
}

async function restoreFocus(): Promise<void> {
  await nextTick()
  if (returnFocus.value?.isConnected) returnFocus.value.focus()
  else document.querySelector<HTMLElement>('button[aria-label="Create project"]')?.focus()
}

async function closeProjectDialog(): Promise<void> {
  projectDialogVisible.value = false
  await restoreFocus()
}

async function closeDeleteDialog(): Promise<void> {
  deleteDialogVisible.value = false
  await restoreFocus()
}

async function handleProjectSubmit(name: string): Promise<void> {
  busy.value = true
  errorMessage.value = ''
  try {
    if (projectDialogMode.value === 'create') {
      const project = await projectApi.create(name)
      projects.value = [project, ...projects.value]
    } else if (selectedProject.value) {
      const project = await projectApi.rename(selectedProject.value.id, name)
      projects.value = projects.value.map((candidate) =>
        candidate.id === project.id ? project : candidate,
      )
    }
    await closeProjectDialog()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The project could not be saved.'
  } finally {
    busy.value = false
  }
}

async function handleDelete(): Promise<void> {
  const project = selectedProject.value
  if (!project) return
  busy.value = true
  errorMessage.value = ''
  try {
    await projectApi.delete(project.id, project.name)
    projects.value = projects.value.filter((candidate) => candidate.id !== project.id)
    await closeDeleteDialog()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The project could not be deleted.'
  } finally {
    busy.value = false
  }
}

function handleOpen(project: ProjectDto): void {
  void router.push(`/projects/${project.id}`)
}

onMounted(loadProjects)
</script>

<template>
  <div class="min-h-screen bg-[var(--color-app)] text-[var(--color-text)]">
    <header class="flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-chrome)] px-3">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-semibold tracking-wide">Scr</span>
        <span class="font-mono text-[0.6875rem] text-[var(--color-muted)]">Projects</span>
      </div>
      <Button
        label="New project"
        icon="pi pi-plus"
        class="h-9 bg-[var(--color-focus)] px-3 text-xs font-semibold text-[var(--color-app)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        aria-label="Create project"
        @click="openCreate"
      />
    </header>

    <main id="main-content" class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6">
      <h1 class="text-lg font-semibold leading-tight">Projects</h1>

      <p v-if="loading" role="status" class="py-8 text-center text-sm text-[var(--color-muted)]">
        Loading projects…
      </p>
      <div
        v-else-if="errorMessage"
        role="alert"
        class="flex min-h-11 items-center justify-between gap-3 border-y border-[var(--color-danger)] px-3 py-2 text-sm"
      >
        <span>{{ errorMessage }}</span>
        <Button label="Retry" text class="h-11 px-3 text-sm text-[var(--color-focus)]" @click="loadProjects" />
      </div>
      <div v-else-if="projects.length === 0" class="border-y border-[var(--color-border)] py-10 text-center">
        <p class="text-sm text-[var(--color-muted)]">No projects.</p>
        <Button
          label="Create project"
          text
          class="mt-2 h-11 px-3 text-sm text-[var(--color-focus)]"
          @click="openCreate"
        />
      </div>
      <ProjectList
        v-else
        :projects="projects"
        @open="handleOpen"
        @rename="openRename"
        @delete="openDelete"
      />
    </main>

    <ProjectDialog
      :visible="projectDialogVisible"
      :mode="projectDialogMode"
      :initial-name="selectedProject?.name"
      :busy="busy"
      @close="closeProjectDialog"
      @submit="handleProjectSubmit"
    />
    <DeleteProjectDialog
      :visible="deleteDialogVisible"
      :project-name="selectedProject?.name ?? ''"
      :busy="busy"
      @close="closeDeleteDialog"
      @confirm="handleDelete"
    />
  </div>
</template>
