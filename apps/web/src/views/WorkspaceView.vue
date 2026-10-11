<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppToolbar from '../components/layout/AppToolbar.vue'
import MobilePanelSwitcher from '../components/layout/MobilePanelSwitcher.vue'
import StatusBar from '../components/layout/StatusBar.vue'
import WorkspacePanes from '../components/layout/WorkspacePanes.vue'
import BinderTree from '../features/binder/BinderTree.vue'
import FolderContents from '../features/binder/FolderContents.vue'
import { useWorkspaceStore, type WorkspacePanel } from '../stores/workspace.js'

type WorkspaceLayout = 'desktop' | 'tablet' | 'phone'

const route = useRoute()
const store = useWorkspaceStore()
const layout = ref<WorkspaceLayout>(layoutForWidth(window.innerWidth))

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

onMounted(() => {
  window.addEventListener('resize', updateLayout)
  void store.load(String(route.params.projectId))
})
onBeforeUnmount(() => window.removeEventListener('resize', updateLayout))
</script>

<template>
  <div class="workspace-shell">
    <AppToolbar
      :project-name="store.project?.name ?? 'Opening project…'"
      :binder-open="layout === 'desktop' ? store.binderOpen : store.activePanel === 'binder'"
      :inspector-open="layout === 'desktop' ? store.inspectorOpen : store.activePanel === 'inspector'"
      @toggle-binder="toggleBinder"
      @toggle-inspector="toggleInspector"
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
            @open="store.activeItemId = $event.id"
          />
          <div v-else-if="store.activeItem?.kind === 'document'" class="editor-placeholder">
            <input :value="store.activeItem.title" aria-label="Document title" readonly />
            <div role="textbox" aria-label="Document editor" aria-readonly="true">
              The editor opens here.
            </div>
          </div>
          <p v-else class="workspace-empty">Select or create a document.</p>
        </main>
      </template>
      <template #inspector>
        <aside aria-label="Inspector" class="workspace-inspector-content">
          <div role="tablist" aria-label="Inspector sections">
            <button type="button" role="tab" aria-selected="true">Notes</button>
            <button type="button" role="tab" aria-selected="false">Snapshots</button>
          </div>
          <p>No document selected.</p>
        </aside>
      </template>
    </WorkspacePanes>

    <MobilePanelSwitcher
      v-if="layout === 'phone'"
      :active-panel="store.activePanel"
      @select="selectPanel"
    />
    <StatusBar :item-title="store.activeItem?.title" />
  </div>
</template>
