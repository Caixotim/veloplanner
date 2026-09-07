import type { TrainingSession } from './types'
import { formatDateInTimezone, normalizeTimezone } from './timezone'

export type SyncSessionEntry = {
  week: number
  session: TrainingSession
}

export function deduplicateSyncSessions(sessions: SyncSessionEntry[], timeZone = 'UTC'): SyncSessionEntry[] {
  const seen = new Set<string>()
  const normalizedTimeZone = normalizeTimezone(timeZone)

  return sessions.filter(({ session }) => {
    const date = toDateKey(session.date, normalizedTimeZone)
    // Intervals.icu is date-based for planned events. A plan must never publish
    // more than one workout for the same local calendar day, even when stale
    // local data contains sessions with different types or equipment.
    const key = date

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toDateKey(value: Date | string | number, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value)
  return formatDateInTimezone(date, timeZone)
}
