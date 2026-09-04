import type { TrainingSession } from './types'

export type SyncSessionEntry = {
  week: number
  session: TrainingSession
}

export function deduplicateSyncSessions(sessions: SyncSessionEntry[]): SyncSessionEntry[] {
  const seen = new Set<string>()

  return sessions.filter(({ session }) => {
    const date = toDateKey(session.date)
    const modality = `${session.type}:${[...session.equipment].sort().join(',')}`
    const key = `${date}:${modality}`

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toDateKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
