/**
 * rideMatcher.ts
 *
 * Matches cached Intervals.icu rides to planned training sessions by date.
 * A ride is considered a match if its local date falls within ±1 day of a
 * planned session's date and the session is not a rest day.
 */

export type CachedRide = {
  date: number       // timestamp ms
  duration: number   // minutes
  avgPower?: number
  normalizedPower?: number
  maxPower?: number
  ftpWatts?: number
  avgHR?: number
  distance?: number
  trainingLoad?: number
}

export type RideMatch = {
  ride: CachedRide
  /** difference in days between ride and session date (negative = ride before session) */
  dayOffset: number
}

/** Keyed by YYYY-MM-DD session date string */
export type RideMatchMap = Map<string, RideMatch>

function toDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sessionDateKey(sessionDate: Date | string): string {
  const d = typeof sessionDate === 'string' ? new Date(sessionDate) : sessionDate
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build a map from session date key → best matching ride.
 *
 * Strategy:
 * 1. Index rides by YYYY-MM-DD.
 * 2. For each planned session date, look for rides on that exact date first,
 *    then ±1 day, preferring the closest offset and — if tied — the longer ride.
 */
export function buildRideMatchMap(
  rides: CachedRide[],
  sessionDates: Date[],
  windowDays = 1,
): RideMatchMap {
  // Index rides by date key (multiple rides per day possible)
  const ridesByDay = new Map<string, CachedRide[]>()
  for (const ride of rides) {
    if (!ride.date || ride.date <= 0) continue
    const key = toDateKey(ride.date)
    const bucket = ridesByDay.get(key) ?? []
    bucket.push(ride)
    ridesByDay.set(key, bucket)
  }

  const result: RideMatchMap = new Map()

  for (const sessionDate of sessionDates) {
    const sessionKey = sessionDateKey(sessionDate)
    const sessionMs = new Date(sessionKey).getTime()

    let bestMatch: RideMatch | null = null

    for (let offset = 0; offset <= windowDays; offset++) {
      const offsets = offset === 0 ? [0] : [offset, -offset]
      for (const dayOffset of offsets) {
        const candidateMs = sessionMs + dayOffset * 24 * 60 * 60 * 1000
        const candidateKey = toDateKey(candidateMs)
        const candidates = ridesByDay.get(candidateKey)
        if (!candidates || candidates.length === 0) continue

        // Pick the longest ride on that day (most likely the "main" workout)
        const best = candidates.reduce((a, b) => (b.duration > a.duration ? b : a))

        if (bestMatch === null || Math.abs(dayOffset) < Math.abs(bestMatch.dayOffset)) {
          bestMatch = { ride: best, dayOffset }
        }
      }
      if (bestMatch?.dayOffset === 0) break // exact match wins, stop searching
    }

    if (bestMatch) {
      result.set(sessionKey, bestMatch)
    }
  }

  return result
}

/** Derive estimated TSS from a cached ride when training load is not directly available */
export function estimateTSSFromRide(ride: CachedRide, ftp?: number): number | null {
  if (ride.trainingLoad && ride.trainingLoad > 0) return Math.round(ride.trainingLoad)

  const power = ride.normalizedPower ?? ride.avgPower
  if (!power || !ftp || ftp <= 0) return null

  const hours = ride.duration / 60
  const IF = power / ftp
  return Math.round(hours * IF * IF * 100)
}
