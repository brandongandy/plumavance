import type { DailyCountMode } from '@pluma/shared'

export function dailyDelta(change: number, mode: DailyCountMode, editMode: boolean): number {
  if (editMode) return 0
  return mode === 'additions' ? Math.max(0, change) : change
}

export function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function millisecondsUntilNextLocalMidnight(date: Date): number {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return midnight.getTime() - date.getTime()
}
