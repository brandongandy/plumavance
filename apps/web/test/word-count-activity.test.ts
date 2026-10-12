import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  dailyDelta,
  localDateKey,
  millisecondsUntilNextLocalMidnight,
} from '../src/features/word-count/activity.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('word count activity', () => {
  test('counts additions, permits net deletions, and excludes edit mode', () => {
    expect(dailyDelta(8, 'additions', false)).toBe(8)
    expect(dailyDelta(-8, 'additions', false)).toBe(0)
    expect(dailyDelta(-8, 'net', false)).toBe(-8)
    expect(dailyDelta(8, 'additions', true)).toBe(0)
    expect(dailyDelta(-8, 'net', true)).toBe(0)
    expect(dailyDelta(0, 'net', false)).toBe(0)
  })

  test('keys activity by the local calendar day rather than the UTC day', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(localDateKey(new Date(2026, 9, 12, 23, 59))).toBe('2026-10-12')
    expect(localDateKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02')
  })

  test.each([
    [new Date('2026-03-08T00:00:00-08:00'), 23, '2026-03-09'],
    [new Date('2026-11-01T00:00:00-07:00'), 25, '2026-11-02'],
  ])('schedules the next local midnight across daylight saving changes (%s)', (start, hours, day) => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    vi.useFakeTimers()
    vi.setSystemTime(start)
    const delay = millisecondsUntilNextLocalMidnight(new Date())
    expect(delay).toBe(hours * 60 * 60 * 1000)
    const rollover = vi.fn(() => localDateKey(new Date()))
    setTimeout(rollover, delay)
    vi.advanceTimersByTime(delay - 1)
    expect(rollover).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(rollover).toHaveReturnedWith(day)
    expect(new Date().getHours()).toBe(0)
  })

  test('schedules midnight from the current time and rolls over month boundaries', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(millisecondsUntilNextLocalMidnight(new Date(2026, 11, 31, 23, 59, 59, 500))).toBe(500)
  })
})
