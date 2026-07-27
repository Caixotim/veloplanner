import type { TrainingPlan } from './types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function toDateSafe(value: unknown, fallback: Date): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
  }

  return fallback
}

export function hydrateTrainingPlanDates(rawPlan: unknown): TrainingPlan | null {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return null
  }

  const planCandidate = rawPlan as Partial<TrainingPlan>
  const now = new Date()
  const startDate = toDateSafe(planCandidate.startDate, now)
  const endDate = toDateSafe(planCandidate.endDate, new Date(startDate.getTime() + WEEK_MS))

  const weeks = Array.isArray(planCandidate.weeks)
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

  return {
    ...(planCandidate as TrainingPlan),
    startDate,
    endDate,
    createdAt: toDateSafe(planCandidate.createdAt, now),
    updatedAt: toDateSafe(planCandidate.updatedAt, now),
    weeks,
  }
}
