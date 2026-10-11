<script setup lang="ts">
import type { SnapshotDto } from '@scr/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { nextTick, ref } from 'vue'

import { countText } from '../editor/counts.js'
import { useDocumentStore } from '../../stores/document.js'
import SnapshotCompareDialog from './SnapshotCompareDialog.vue'
import SnapshotPreviewDialog from './SnapshotPreviewDialog.vue'
import TakeSnapshotDialog from './TakeSnapshotDialog.vue'

const store = useDocumentStore()
const takeVisible = ref(false)
const renameVisible = ref(false)
const previewVisible = ref(false)
const compareVisible = ref(false)
const confirmAction = ref<'restore' | 'delete' | null>(null)
const selected = ref<SnapshotDto | null>(null)
const returnFocus = ref<HTMLElement | null>(null)

function remember(event?: Event): void {
  returnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

async function closeAll(): Promise<void> {
  takeVisible.value = false
  renameVisible.value = false
  previewVisible.value = false
  compareVisible.value = false
  confirmAction.value = null
  await nextTick()
  returnFocus.value?.focus()
}

function selectSnapshot(snapshot: SnapshotDto, event: Event): void {
  selected.value = snapshot
  remember(event)
}

async function take(name: string, saveFirst: boolean): Promise<void> {
  if (saveFirst && !(await store.save())) return
  if (await store.takeSnapshot(name)) await closeAll()
}

async function rename(name: string): Promise<void> {
  if (!selected.value) return
  await store.renameSnapshot(selected.value.id, name)
  await closeAll()
}

async function confirm(): Promise<void> {
  if (!selected.value) return
  if (confirmAction.value === 'restore') await store.restoreSnapshot(selected.value.id)
  else if (confirmAction.value === 'delete') await store.deleteSnapshot(selected.value.id)
  await closeAll()
}
</script>

<template>
  <div class="snapshot-list">
    <div class="snapshot-list-toolbar">
      <Button
        label="Take Snapshot"
        icon="pi pi-camera"
        text
        aria-label="Take snapshot"
        @click="remember($event); takeVisible = true"
      />
    </div>
    <p v-if="store.snapshots.length === 0" class="snapshot-empty">No snapshots.</p>
    <article v-for="snapshot in store.snapshots" :key="snapshot.id" class="snapshot-row">
      <div class="min-w-0">
        <strong>{{ snapshot.name || 'Untitled snapshot' }}</strong>
        <span>{{ new Date(snapshot.createdAt).toLocaleString() }} · {{ countText(snapshot.contentText).words }} words</span>
      </div>
      <div class="snapshot-actions">
        <Button icon="pi pi-eye" text :aria-label="`Preview ${snapshot.name || 'snapshot'}`" @click="selectSnapshot(snapshot, $event); previewVisible = true" />
        <Button icon="pi pi-arrows-h" text :aria-label="`Compare ${snapshot.name || 'snapshot'}`" @click="selectSnapshot(snapshot, $event); compareVisible = true" />
        <Button icon="pi pi-pencil" text :aria-label="`Rename ${snapshot.name || 'snapshot'}`" @click="selectSnapshot(snapshot, $event); renameVisible = true" />
        <Button icon="pi pi-replay" text :aria-label="`Restore ${snapshot.name || 'snapshot'}`" @click="selectSnapshot(snapshot, $event); confirmAction = 'restore'" />
        <Button icon="pi pi-trash" text :aria-label="`Delete ${snapshot.name || 'snapshot'}`" @click="selectSnapshot(snapshot, $event); confirmAction = 'delete'" />
      </div>
    </article>

    <TakeSnapshotDialog :visible="takeVisible" :dirty="store.isDirty" @close="closeAll" @confirm="take" />
    <TakeSnapshotDialog
      :visible="renameVisible"
      :dirty="false"
      mode="rename"
      :initial-name="selected?.name ?? ''"
      @close="closeAll"
      @confirm="rename($event)"
    />
    <SnapshotPreviewDialog :visible="previewVisible" :snapshot="selected" @close="closeAll" />
    <SnapshotCompareDialog
      :visible="compareVisible"
      :current-text="store.contentText"
      :snapshot-text="selected?.contentText ?? ''"
      @close="closeAll"
    />
    <Dialog
      :visible="Boolean(confirmAction)"
      modal
      :header="confirmAction === 'restore' ? 'Restore Snapshot' : 'Delete Snapshot'"
      :draggable="false"
      class="scr-dialog"
      @update:visible="!$event && closeAll()"
    >
      <p v-if="confirmAction === 'restore'">Replace the saved document content with this snapshot? Title and notes will not change.</p>
      <p v-else>This permanently deletes the selected snapshot.</p>
      <template #footer>
        <Button label="Cancel" text @click="closeAll" />
        <Button
          :label="confirmAction === 'restore' ? 'Restore' : 'Delete'"
          :severity="confirmAction === 'delete' ? 'danger' : undefined"
          :aria-label="confirmAction === 'restore' ? 'Confirm restore snapshot' : 'Confirm delete snapshot'"
          @click="confirm"
        />
      </template>
    </Dialog>
  </div>
</template>
