import { computed, type CSSProperties, type ComputedRef } from 'vue'

import { useWorkspaceStore } from '../../stores/workspace.js'

type SnapshotDialogStyle = CSSProperties & {
  '--snapshot-dialog-desktop-width': string
}

export function useSnapshotDialogStyle(): ComputedRef<SnapshotDialogStyle> {
  const workspace = useWorkspaceStore()

  return computed(() => {
    const sidePaneWidth =
      (workspace.binderOpen ? workspace.binderWidth : 0) +
      (workspace.inspectorOpen ? workspace.inspectorWidth : 0)

    return {
      '--snapshot-dialog-desktop-width': `calc(100vw - ${sidePaneWidth + 2}px)`,
    }
  })
}
