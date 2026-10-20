<script setup lang="ts">
import type { SnapshotDto, SnapshotSummaryDto } from '@pluma/shared'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { nextTick, ref } from 'vue'

import TooltipButton from '../../components/controls/TooltipButton.vue'
import { provideTooltipGroup } from '../../components/controls/tooltipGroup.js'
import { useDocumentStore } from '../../stores/document.js'
import SnapshotCompareDialog from './SnapshotCompareDialog.vue'
import SnapshotPreviewDialog from './SnapshotPreviewDialog.vue'
import TakeSnapshotDialog from './TakeSnapshotDialog.vue'

const store = useDocumentStore()
provideTooltipGroup()
const takeVisible = ref(false)
const renameVisible = ref(false)
const previewVisible = ref(false)
const compareVisible = ref(false)
const confirmAction = ref<'restore' | 'delete' | null>(null)
const selected = ref<SnapshotSummaryDto | null>(null)
const selectedDetail = ref<SnapshotDto | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const returnFocus = ref<HTMLElement | null>(null)
let detailSequence = 0

function remember(event?: Event): void {
  returnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

async function closeAll(): Promise<void> {
  detailSequence += 1
  takeVisible.value = false
  renameVisible.value = false
  previewVisible.value = false
  compareVisible.value = false
  confirmAction.value = null
  selectedDetail.value = null
  detailLoading.value = false
  detailError.value = ''
  await nextTick()
  returnFocus.value?.focus()
}

function selectSnapshot(snapshot: SnapshotSummaryDto, event: Event): void {
  selected.value = snapshot
  remember(event)
}

async function openDetail(
  snapshot: SnapshotSummaryDto,
  event: Event,
  mode: 'preview' | 'compare',
): Promise<void> {
  selectSnapshot(snapshot, event)
  selectedDetail.value = null
  detailError.value = ''
  detailLoading.value = true
  if (mode === 'preview') previewVisible.value = true
  else compareVisible.value = true
  const sequence = ++detailSequence
  const detail = await store.loadSnapshotDetail(snapshot.id)
  if (sequence !== detailSequence || selected.value?.id !== snapshot.id) return
  detailLoading.value = false
  if (detail) selectedDetail.value = detail
  else detailError.value = store.errorMessage || 'The snapshot could not be loaded.'
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
      <TooltipButton
        label="Take Snapshot"
        icon="pi pi-camera"
        aria-label="Take snapshot"
        tooltip="Take snapshot"
        placement="end"
        @click="remember($event); takeVisible = true"
      />
    </div>
    <p v-if="store.snapshots.length === 0" class="snapshot-empty">No snapshots.</p>
    <article v-for="snapshot in store.snapshots" :key="snapshot.id" class="snapshot-row">
      <div class="min-w-0">
        <strong>{{ snapshot.name || 'Untitled snapshot' }}</strong>
        <span class="snapshot-metadata">{{ new Date(snapshot.createdAt).toLocaleString() }} · {{ snapshot.wordCount }} words</span>
      </div>
      <div class="snapshot-actions">
        <TooltipButton
          icon="pi pi-eye"
          :aria-label="`Preview ${snapshot.name || 'snapshot'}`"
          tooltip="Preview snapshot"
          @click="openDetail(snapshot, $event, 'preview')"
        />
        <TooltipButton
          icon="pi pi-arrows-h"
          :aria-label="`Compare ${snapshot.name || 'snapshot'}`"
          tooltip="Compare snapshot"
          @click="openDetail(snapshot, $event, 'compare')"
        />
        <TooltipButton
          icon="pi pi-pencil"
          :aria-label="`Rename ${snapshot.name || 'snapshot'}`"
          tooltip="Rename snapshot"
          @click="selectSnapshot(snapshot, $event); renameVisible = true"
        />
        <TooltipButton
          icon="pi pi-replay"
          :aria-label="`Restore ${snapshot.name || 'snapshot'}`"
          tooltip="Restore snapshot"
          @click="selectSnapshot(snapshot, $event); confirmAction = 'restore'"
        />
        <TooltipButton
          icon="pi pi-trash"
          :aria-label="`Delete ${snapshot.name || 'snapshot'}`"
          tooltip="Delete snapshot"
          placement="end"
          @click="selectSnapshot(snapshot, $event); confirmAction = 'delete'"
        />
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
    <SnapshotPreviewDialog
      :visible="previewVisible"
      :snapshot="selectedDetail"
      :loading="detailLoading"
      :error="detailError"
      @close="closeAll"
    />
    <SnapshotCompareDialog
      :visible="compareVisible"
      :current-text="store.contentText"
      :snapshot-text="selectedDetail?.contentText ?? ''"
      :loading="detailLoading"
      :error="detailError"
      @close="closeAll"
    />
    <Dialog
      :visible="Boolean(confirmAction)"
      modal
      :header="confirmAction === 'restore' ? 'Restore Snapshot' : 'Delete Snapshot'"
      :draggable="false"
      class="pluma-dialog"
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
