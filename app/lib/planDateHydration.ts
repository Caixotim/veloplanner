import type { TrainingPlan } from './types'
import { formatDateInTimezone, normalizeTimezone } from './timezone'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function toDateSafe(value: unknown, fallback: Date): Date {
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    const timestamp = (value as Date).getTime()
    return Number.isNaN(timestamp) ? fallback : new Date(timestamp)
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = parseDateValue(value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
  }

  return fallback
}

function parseDateValue(value: string | number): Date {
  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      // Date-only values represent a calendar date, not midnight UTC. Parsing
      // them as UTC shifts Sundays to Saturday in western time zones.
      return new Date(Number(year), Number(month) - 1, Number(day), 6, 0, 0, 0)
    }
  }

  return new Date(value)
}

export function hydrateTrainingPlanDates(rawPlan: unknown): TrainingPlan | null {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return null
  }

  const planCandidate = rawPlan as Partial<TrainingPlan>
  const now = new Date()
  const startDate = toDateSafe(planCandidate.startDate, now)
  const endDate = toDateSafe(planCandidate.endDate, new Date(startDate.getTime() + WEEK_MS))

  const hydratedWeeks = Array.isArray(planCandidate.weeks)
    ? planCandidate.weeks.map((week) => ({
        ...week,
        sessions: Array.isArray(week.sessions)
          ? week.sessions.map((session) => ({
              ...session,
              date: toDateSafe(session.date, startDate),
            }))
          : [],
      }))
    : []
  const timeZone = normalizeTimezone(planCandidate.timezone)
  const canonicalSessionByDate = new Map<string, (typeof hydratedWeeks)[number]['sessions'][number]>()

  for (const week of hydratedWeeks) {
    for (const session of week.sessions) {
      const dateKey = formatDateInTimezone(session.date, timeZone)
      const existing = canonicalSessionByDate.get(dateKey)
      if (!existing || session.duration > existing.duration || (session.type !== 'recovery' && existing.type === 'recovery')) {
        canonicalSessionByDate.set(dateKey, session)
      }
    }
  }

  const weeks = hydratedWeeks.map((week) => ({
    ...week,
    sessions: week.sessions.filter((session) => canonicalSessionByDate.get(formatDateInTimezone(session.date, timeZone)) === session),
    totalHours: week.sessions
      .filter((session) => canonicalSessionByDate.get(formatDateInTimezone(session.date, timeZone)) === session)
      .reduce((sum, session) => sum + session.duration / 60, 0),
  }))

  return {
    ...(planCandidate as TrainingPlan),
    startDate,
    endDate,
    createdAt: toDateSafe(planCandidate.createdAt, now),
    updatedAt: toDateSafe(planCandidate.updatedAt, now),
    weeks,
  }
}
