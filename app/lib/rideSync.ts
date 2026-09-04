export type ActivityWithId = {
  id?: number | string | null
  start_date_local?: string
}

export function hasStableActivityId(activity: ActivityWithId): boolean {
  return activity.id !== undefined && activity.id !== null && String(activity.id).trim().length > 0
}

export function filterStableActivities<T extends ActivityWithId>(activities: T[]): T[] {
  return activities.filter(hasStableActivityId)
}

export function getRideCursor(dates: number[], fallback: number): number {
  const validDates = dates.filter((date) => Number.isFinite(date) && date >= 0)
  return validDates.length > 0 ? Math.max(...validDates) : fallback
}
