<script setup lang="ts">
import type { CompileRequest } from '@pluma/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute } from 'vue-router'

import AppToolbar from '../components/layout/AppToolbar.vue'
import MobilePanelSwitcher from '../components/layout/MobilePanelSwitcher.vue'
import StatusBar from '../components/layout/StatusBar.vue'
import WorkspacePanes from '../components/layout/WorkspacePanes.vue'
import { useUnsavedGuard } from '../composables/useUnsavedGuard.js'
import BinderTree from '../features/binder/BinderTree.vue'
import FolderContents from '../features/binder/FolderContents.vue'
import CompileDialog from '../features/compile/CompileDialog.vue'
import { useCompile } from '../features/compile/useCompile.js'
import DocumentEditor from '../features/editor/DocumentEditor.vue'
import DocumentHeader from '../features/editor/DocumentHeader.vue'
import SaveStatus from '../features/editor/SaveStatus.vue'
import FocusExitButton from '../features/focus/FocusExitButton.vue'
import { useFocusMode } from '../features/focus/useFocusMode.js'
import InspectorPane from '../features/inspector/InspectorPane.vue'
import { useDocumentStore } from '../stores/document.js'
import { useWorkspaceStore, type WorkspacePanel } from '../stores/workspace.js'
import { useWritingProgressStore } from '../stores/writing-progress.js'

type WorkspaceLayout = 'desktop' | 'tablet' | 'phone'

const route = useRoute()
const store = useWorkspaceStore()
const documentStore = useDocumentStore()
const writingProgress = useWritingProgressStore()
const unsavedGuard = useUnsavedGuard(() => documentStore.isDirty)
onBeforeRouteUpdate((to, from) => to.params.projectId === from.params.projectId || unsavedGuard.canTransition())
const compileTask = useCompile()
const compileVisible = ref(false)
const compileTrigger = ref<HTMLElement | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
const focusMode = useFocusMode(workspaceRoot)
const layout = ref<WorkspaceLayout>(layoutForWidth(window.innerWidth))
const canSave = computed(() => Boolean(documentStore.documentId) && documentStore.saveState !== 'saving' && documentStore.isDirty)

const folderChildren = computed(() => {
  const active = store.activeItem
  if (active?.kind !== 'folder') return []
  return store.items
    .filter((item) => item.parentId === active.id)
    .sort((left, right) => left.position - right.position)
})

function layoutForWidth(width: number): WorkspaceLayout {
  if (width < 768) return 'phone'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function updateLayout(): void {
  layout.value = layoutForWidth(window.innerWidth)
  if (layout.value !== 'desktop' && !['binder', 'editor', 'inspector'].includes(store.activePanel)) {
    store.activePanel = 'editor'
  }
}

function toggleBinder(): void {
  if (layout.value === 'desktop') store.binderOpen = !store.binderOpen
  else store.activePanel = store.activePanel === 'binder' ? 'editor' : 'binder'
}

function toggleInspector(): void {
  if (layout.value === 'desktop') store.inspectorOpen = !store.inspectorOpen
  else store.activePanel = store.activePanel === 'inspector' ? 'editor' : 'inspector'
}

function selectPanel(panel: WorkspacePanel): void {
  store.activePanel = panel
}

function openCompile(event: Event): void {
  compileTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  compileVisible.value = true
}

function openCompileFromKeyboard(): void {
  if (compileVisible.value) return
  compileTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  compileVisible.value = true
}

async function enterFocusMode(): Promise<void> {
  const editor = workspaceRoot.value?.querySelector<HTMLElement>('[aria-label="Document editor"]')
  if (!editor) return
  await focusMode.enter()
  await nextTick()
  editor.focus({ preventScroll: true })
}

function handleWorkspaceShortcut(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || (!event.metaKey && !event.ctrlKey)) return
  const key = event.key.toLocaleLowerCase()

  if (!event.shiftKey && key === 's') {
    if (event.defaultPrevented) return
    event.preventDefault()
    if (canSave.value) void saveDocument()
    return
  }
  if (!event.shiftKey) return
  if ((key === 'e' || key === 'enter') && compileVisible.value) {
    event.preventDefault()
    return
  }
  if (key === 'e') {
    event.preventDefault()
    openCompileFromKeyboard()
  } else if (key === 'enter') {
    event.preventDefault()
    if (!focusMode.isActive.value) void enterFocusMode()
  }
}

async function closeCompile(): Promise<void> {
  compileVisible.value = false
  await nextTick()
  compileTrigger.value?.focus()
}

async function runCompile(request: CompileRequest): Promise<void> {
  if (await compileTask.compile(store.projectId, request)) await closeCompile()
}

async function openFolderItem(itemId: string): Promise<void> {
  if (itemId !== store.activeItemId && !unsavedGuard.canTransition()) return
  store.activeItemId = itemId
}

async function saveDocument(): Promise<void> {
  if (!(await documentStore.save()) || !documentStore.documentId) return
  store.items = store.items.map((item) =>
    item.id === documentStore.documentId ? { ...item, title: documentStore.title } : item,
  )
}

async function keepMine(): Promise<void> {
  if (!(await documentStore.keepMine()) || !documentStore.documentId) return
  store.items = store.items.map((item) =>
    item.id === documentStore.documentId ? { ...item, title: documentStore.title } : item,
  )
}

async function reloadServerCopy(): Promise<void> {
  if (!(await documentStore.reloadServerCopy()) || !documentStore.documentId) return
  store.items = store.items.map((item) =>
    item.id === documentStore.documentId ? { ...item, title: documentStore.title } : item,
  )
  await writingProgress.refresh()
}

watch(
  () => store.activeItemId,
  async (itemId) => {
    const item = store.items.find((candidate) => candidate.id === itemId)
    if (item?.kind === 'document') await documentStore.load(item.id, () => true, true)
    else documentStore.clear()
  },
)

onMounted(() => {
  window.addEventListener('resize', updateLayout)
  window.addEventListener('keydown', handleWorkspaceShortcut)
})
watch(() => route.params.projectId, (projectId) => { void store.load(String(projectId)) }, { immediate: true })
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateLayout)
  window.removeEventListener('keydown', handleWorkspaceShortcut)
  void writingProgress.flush()
  writingProgress.dispose()
})
</script>

<template>
  <div ref="workspaceRoot" class="workspace-shell" :class="{ 'is-focus-mode': focusMode.isActive.value }">
    <AppToolbar
      :project-name="store.project?.name ?? 'Opening project…'"
      :binder-open="layout === 'desktop' ? store.binderOpen : store.activePanel === 'binder'"
      :inspector-open="layout === 'desktop' ? store.inspectorOpen : store.activePanel === 'inspector'"
      :save-disabled="!canSave"
      :focus-disabled="!documentStore.documentId"
      @toggle-binder="toggleBinder"
      @toggle-inspector="toggleInspector"
      @save="saveDocument"
      @compile="openCompile"
      @focus="enterFocusMode"
    />

    <p v-if="store.loading" role="status" class="workspace-message">Opening project…</p>
    <div v-else-if="store.errorMessage && !store.project" role="alert" class="workspace-message">
      <span>{{ store.errorMessage }}</span>
      <button type="button" @click="store.load(String(route.params.projectId))">Retry</button>
    </div>
    <WorkspacePanes v-else :layout="layout" :active-panel="store.activePanel">
      <template #binder>
        <BinderTree />
      </template>
      <template #editor>
        <main id="main-content" class="workspace-main">
          <FolderContents
            v-if="store.activeItem?.kind === 'folder'"
            :folder="store.activeItem"
            :items="folderChildren"
            @open="openFolderItem($event.id)"
          />
          <div v-else-if="store.activeItem?.kind === 'document'" class="editor-document-pane">
            <p v-if="documentStore.loading" role="status" class="workspace-message">Opening document…</p>
            <template v-else-if="documentStore.documentId === store.activeItem.id">
              <DocumentHeader :model-value="documentStore.title" @update:model-value="documentStore.setTitle" />
              <SaveStatus
                :state="documentStore.saveState"
                :message="documentStore.errorMessage"
                @retry="saveDocument"
                @reload="reloadServerCopy"
                @keep-mine="keepMine"
              />
              <DocumentEditor
                :model-value="documentStore.contentJson"
                :focus-mode="focusMode.isActive.value"
                @update:model-value="documentStore.setContent"
                @save="saveDocument"
                @word-count-delta="writingProgress.recordEditorDelta"
              />
            </template>
          </div>
          <p v-else class="workspace-empty">Select or create a document.</p>
        </main>
      </template>
      <template #inspector>
        <InspectorPane
          :notes="documentStore.notesText"
          :has-document="Boolean(documentStore.documentId)"
          @update:notes="documentStore.setNotes"
        />
      </template>
    </WorkspacePanes>

    <MobilePanelSwitcher
      v-if="layout === 'phone'"
      :active-panel="store.activePanel"
      @select="selectPanel"
    />
    <StatusBar
      :item-title="store.activeItem?.title"
      :save-state="documentStore.saveState"
      :words="documentStore.counts.words"
      :characters="documentStore.counts.characters"
      :project-words="writingProgress.liveProjectWordCount(documentStore.counts.words, documentStore.savedWordCount)"
    />
    <CompileDialog
      :visible="compileVisible"
      :dirty="documentStore.isDirty"
      :busy="compileTask.compiling.value"
      :error="compileTask.error.value"
      @close="closeCompile"
      @save="saveDocument"
      @compile="runCompile"
    />
    <FocusExitButton v-if="focusMode.isActive.value" @exit="focusMode.exit" />
  </div>
</template>
