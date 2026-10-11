<script setup lang="ts">
import { computed } from 'vue'

import { useWorkspaceStore, type WorkspacePanel } from '../../stores/workspace.js'
import PaneResizer from './PaneResizer.vue'

const props = defineProps<{ layout: 'desktop' | 'tablet' | 'phone'; activePanel: WorkspacePanel }>()
const store = useWorkspaceStore()

const workspaceStyle = computed(() => ({
  '--binder-width': `${props.layout === 'desktop' && !store.binderOpen ? 0 : store.binderWidth}px`,
  '--inspector-width': `${props.layout === 'desktop' && !store.inspectorOpen ? 0 : store.inspectorWidth}px`,
}))

const showBinder = computed(() =>
  props.layout === 'desktop' ? store.binderOpen : props.activePanel === 'binder',
)
const showEditor = computed(() => props.layout !== 'phone' || props.activePanel === 'editor')
const showInspector = computed(() =>
  props.layout === 'desktop' ? store.inspectorOpen : props.activePanel === 'inspector',
)
</script>

<template>
  <div
    data-workspace
    :data-layout="layout"
    :data-active-panel="activePanel"
    :style="workspaceStyle"
    class="workspace-panes"
  >
    <section
      v-show="showBinder"
      aria-label="Binder pane"
      data-workspace-pane="binder"
      class="workspace-binder"
    >
      <slot name="binder" />
      <PaneResizer
        v-show="layout === 'desktop' && store.binderOpen"
        label="Resize binder"
        :value="store.binderWidth"
        :min="180"
        :max="420"
        direction="normal"
        @resize="store.setBinderWidth"
      />
    </section>
    <section
      v-show="showEditor"
      data-workspace-pane="editor"
      class="workspace-editor"
    >
      <slot name="editor" />
    </section>
    <section
      v-show="showInspector"
      aria-label="Inspector pane"
      data-workspace-pane="inspector"
      class="workspace-inspector"
    >
      <PaneResizer
        v-show="layout === 'desktop' && store.inspectorOpen"
        label="Resize inspector"
        :value="store.inspectorWidth"
        :min="220"
        :max="420"
        direction="reverse"
        @resize="store.setInspectorWidth"
      />
      <slot name="inspector" />
    </section>
  </div>
</template>
