<script setup lang="ts">
import type { CompileRequest, SnapshotDto } from '@pluma/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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
import EditorTabs from '../features/editor/EditorTabs.vue'
import SplitEditor from '../features/editor/SplitEditor.vue'
import FocusExitButton from '../features/focus/FocusExitButton.vue'
import { useFocusMode } from '../features/focus/useFocusMode.js'
import InspectorPane from '../features/inspector/InspectorPane.vue'
import type { SnapshotOpenRequest, SnapshotPaneState } from '../features/inspector/snapshotPane.js'
import SettingsDialog from '../features/settings/SettingsDialog.vue'
import { useDocumentStore } from '../stores/document.js'
import { useWorkspaceStore, type WorkspacePanel } from '../stores/workspace.js'
import { useWritingProgressStore } from '../stores/writing-progress.js'

type WorkspaceLayout = 'desktop' | 'tablet' | 'phone'

const route = useRoute()
const store = useWorkspaceStore()
const documentStore = useDocumentStore()
const writingProgress = useWritingProgressStore()
let workspaceActive = true
// The workspace outlives suspended editors and snapshot operations. Only accepted
// operations on the same session may synchronize project presentation here.
documentStore.$onAction(({ name, args, after }) => {
  if (name !== 'save' && name !== 'keepMine' && name !== 'reloadServerCopy') return
  const id = args[0]
  const session = documentStore.sessionFor(id)
  after((succeeded) => {
    if (!workspaceActive || !succeeded || !session?.savedBuffer || documentStore.sessionFor(id) !== session) return
    documentSaved(id, session.savedBuffer.title)
    if (name === 'reloadServerCopy') void writingProgress.refresh()
  })
})
const unsavedGuard = useUnsavedGuard((ids) => documentStore.hasDirtySessions(ids))
onBeforeRouteUpdate((to, from) => to.params.projectId === from.params.projectId || unsavedGuard.canDiscard())
const compileTask = useCompile()
const compileVisible = ref(false)
const compileTrigger = ref<HTMLElement | null>(null)
const settingsVisible = ref(false)
const settingsTrigger = ref<HTMLElement | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
const snapshotPane = shallowRef<SnapshotPaneState | null>(null)
const snapshotReturnFocus = shallowRef<HTMLElement | null>(null)
let snapshotSequence = 0
const focusMode = useFocusMode(workspaceRoot)
const layout = ref<WorkspaceLayout>(layoutForWidth(window.innerWidth))
const focusedSession = computed(() => documentStore.sessionFor(store.activeTabId ?? ''))
const singlePane = computed(() => layout.value === 'phone' || focusMode.isActive.value)
const editorSplitOrientation = computed(() => snapshotPane.value
  ? store.splitOrientation ?? 'vertical'
  : store.splitOrientation)
const splitRatio = computed(() => editorSplitOrientation.value ? store.splitRatios[editorSplitOrientation.value] : 0.5)
const displayedSplitIds = computed(() => snapshotPane.value
  ? [snapshotPane.value.summary.documentId]
  : store.splitDocumentIds)
const activeDocumentReady = computed(() =>
  store.activeItem?.kind === 'document'
  && Boolean(focusedSession.value?.savedBuffer)
  && !focusedSession.value?.loading,
)
const canSave = computed(() => activeDocumentReady.value && focusedSession.value?.saveState !== 'saving' && Boolean(focusedSession.value?.isDirty))
const focusedCounts = computed(() => activeDocumentReady.value && focusedSession.value
  ? focusedSession.value.counts : { words: 0, characters: 0 })
const projectWords = computed(() => writingProgress.liveProjectWordCount(
  focusedCounts.value.words,
  activeDocumentReady.value ? focusedSession.value?.savedWordCount ?? 0 : 0,
))

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

function openSettings(event: Event): void {
  settingsTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  settingsVisible.value = true
}

async function closeSettings(): Promise<void> {
  settingsVisible.value = false
  await nextTick()
  settingsTrigger.value?.focus()
}

function openCompileFromKeyboard(): void {
  if (compileVisible.value) return
  compileTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  compileVisible.value = true
}

async function enterFocusMode(): Promise<void> {
  if (!activeDocumentReady.value) return
  await focusMode.enter()
  await nextTick()
  workspaceRoot.value?.querySelector<HTMLElement>('.editor-document-pane.is-focused [contenteditable="true"]')?.focus({ preventScroll: true })
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
  const item = store.items.find((candidate) => candidate.id === itemId)
  if (item?.kind === 'document') {
    const removedIds = store.openDocumentIds.includes(item.id) || !store.activeTabId ? [] : [store.activeTabId]
    if (!unsavedGuard.canDiscard(removedIds)) return
    store.replaceActiveDocument(item.id)
  }
  else if (item) store.activeItemId = item.id
}

function activateTab(itemId: string): void {
  store.activateTab(itemId)
}

function closeTab(itemId: string, closeOthers: boolean): void {
  const removedIds = closeOthers ? store.openDocumentIds.filter((id) => id !== itemId) : [itemId]
  if (!unsavedGuard.canDiscard(removedIds)) return
  if (closeOthers) store.closeOtherDocumentTabs(itemId)
  else store.closeDocumentTab(itemId)
}

async function saveDocument(): Promise<void> {
  const id = store.activeTabId
  if (!activeDocumentReady.value || !id) return
  await documentStore.save(id)
}

function documentSaved(id: string, title: string): void {
  if (!store.items.some((item) => item.id === id && item.title !== title)) return
  store.items = store.items.map((item) =>
    item.id === id ? { ...item, title } : item,
  )
}

function resizeSplit(ratio: number): void {
  if (editorSplitOrientation.value) store.setSplitRatio(editorSplitOrientation.value, ratio)
}

async function closeSnapshotPane(restoreFocus = true): Promise<void> {
  snapshotSequence += 1
  snapshotPane.value = null
  store.exitSplit()
  await nextTick()
  if (!restoreFocus) {
    snapshotReturnFocus.value = null
    return
  }
  const trigger = snapshotReturnFocus.value
  snapshotReturnFocus.value = null
  if (layout.value === 'desktop' && store.inspectorOpen && !focusMode.isActive.value && trigger?.isConnected) {
    trigger.focus({ preventScroll: true })
    return
  }
  workspaceRoot.value
    ?.querySelector<HTMLElement>(`[data-tab-id="${store.activeTabId}"] .editor-tab-title`)
    ?.focus({ preventScroll: true })
}

function exitEditorSplit(): void {
  if (snapshotPane.value) void closeSnapshotPane()
  else store.exitSplit()
}

async function openSnapshotPane(request: SnapshotOpenRequest): Promise<void> {
  if (request.documentId !== store.activeTabId) return
  const sequence = ++snapshotSequence
  snapshotReturnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  snapshotPane.value = {
    mode: request.mode,
    summary: request.snapshot,
    detail: null,
    currentText: documentStore.sessionFor(request.documentId)?.contentText ?? '',
    loading: true,
    error: '',
  }
  store.activePanel = 'editor'
  await nextTick()
  workspaceRoot.value
    ?.querySelector<HTMLElement>('[data-snapshot-pane] [aria-label="Close snapshot pane"]')
    ?.focus({ preventScroll: true })
  let detail: SnapshotDto | undefined
  try {
    detail = await documentStore.loadSnapshotDetail(request.documentId, request.snapshot.id)
  } catch (error) {
    if (sequence !== snapshotSequence || snapshotPane.value?.summary.id !== request.snapshot.id) return
    snapshotPane.value = {
      ...snapshotPane.value,
      loading: false,
      error: error instanceof Error ? error.message : 'The snapshot could not be loaded.',
    }
    return
  }
  if (sequence !== snapshotSequence || snapshotPane.value?.summary.id !== request.snapshot.id) return
  snapshotPane.value = detail
    ? { ...snapshotPane.value, detail, loading: false }
    : {
        ...snapshotPane.value,
        loading: false,
        error: 'The snapshot could not be loaded.',
      }
}

onMounted(() => {
  window.addEventListener('resize', updateLayout)
  window.addEventListener('keydown', handleWorkspaceShortcut)
})
watch(() => route.params.projectId, (projectId) => { void store.load(String(projectId)) }, { immediate: true })
watch(() => store.activeTabId, (id) => {
  if (snapshotPane.value && id !== snapshotPane.value.summary.documentId) void closeSnapshotPane(false)
})
onBeforeUnmount(() => {
  workspaceActive = false
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
      :focus-disabled="!activeDocumentReady"
      @toggle-binder="toggleBinder"
      @toggle-inspector="toggleInspector"
      @save="saveDocument"
      @compile="openCompile"
      @focus="enterFocusMode"
      @settings="openSettings"
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
          <EditorTabs
            v-if="store.openDocuments.length"
            :tabs="store.openDocuments"
            :active-id="store.activeItem?.kind === 'document' ? store.activeTabId : null"
            :split-ids="displayedSplitIds"
            :split-orientation="editorSplitOrientation"
            @activate="activateTab"
            @close="closeTab"
            @split="store.enterSplit"
            @exit-split="exitEditorSplit"
          />
          <div class="workspace-main-content">
            <FolderContents
              v-if="store.activeItem?.kind === 'folder'"
              :folder="store.activeItem"
              :items="folderChildren"
              @open="openFolderItem($event.id)"
            />
            <SplitEditor
              v-else-if="store.activeItem?.kind === 'document'"
              :document-ids="store.renderedDocumentIds"
              :focused-id="store.activeTabId"
              :orientation="editorSplitOrientation"
              :ratio="splitRatio"
              :single-pane="singlePane"
              :focus-mode="focusMode.isActive.value"
              :snapshot="snapshotPane"
              @focus="store.activateTab"
              @resize="resizeSplit"
              @close-snapshot="closeSnapshotPane"
              @word-count-delta="writingProgress.recordEditorDelta"
            />
            <p v-else class="workspace-empty">Select or create a document.</p>
          </div>
        </main>
      </template>
      <template #inspector>
        <InspectorPane
          :document-id="activeDocumentReady ? store.activeTabId : null"
          @open-snapshot="openSnapshotPane"
        />
      </template>
    </WorkspacePanes>

    <MobilePanelSwitcher
      v-if="layout === 'phone'"
      :active-panel="store.activePanel"
      @select="selectPanel"
    />
    <StatusBar
      :item-title="store.activeItem?.kind === 'document' ? focusedSession?.title : store.activeItem?.title"
      :save-state="activeDocumentReady ? focusedSession?.saveState ?? 'saved' : 'saved'"
      :words="focusedCounts.words"
      :characters="focusedCounts.characters"
      :project-words="projectWords"
    />
    <CompileDialog
      :visible="compileVisible"
      :dirty="activeDocumentReady && Boolean(focusedSession?.isDirty)"
      :busy="compileTask.compiling.value"
      :error="compileTask.error.value"
      @close="closeCompile"
      @save="saveDocument"
      @compile="runCompile"
    />
    <SettingsDialog :visible="settingsVisible" @close="closeSettings" />
    <FocusExitButton v-if="focusMode.isActive.value" @exit="focusMode.exit" />
  </div>
</template>
