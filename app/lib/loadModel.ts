import type { DailyLoadPoint, LoadModelSummary, SessionType, TrainingPlan } from './types'

type RideLoadPoint = {
  date: number
  duration: number
  avgPower?: number
  normalizedPower?: number
  ftpWatts?: number
}

type BuildDailyLoadSeriesOptions = {
  plan: TrainingPlan
  rides: RideLoadPoint[]
  ftpFallback?: number
}

const SESSION_LOAD_FACTOR: Record<SessionType, number> = {
  recovery: 0.45,
  endurance: 0.75,
  tempo: 0.95,
  threshold: 1.1,
  vo2max: 1.2,
  anaerobic: 1.25,
  strength: 0.85,
}

const ATL_TIME_CONSTANT = 7
const CTL_TIME_CONSTANT = 42

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 6, 0, 0, 0)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getPlannedSessionStress(sessionType: SessionType, durationMinutes: number): number {
  if (durationMinutes <= 0) {
    return 0
  }

  return roundToOne(durationMinutes * SESSION_LOAD_FACTOR[sessionType])
}

function getRideStress(ride: RideLoadPoint, ftpFallback?: number): number {
  const durationHours = Math.max(0, ride.duration || 0) / 60
  if (durationHours <= 0) {
    return 0
  }

  const power = ride.avgPower || ride.normalizedPower || 0
  const ftp = ride.ftpWatts || ftpFallback || 0
  if (power > 0 && ftp > 0) {
    const intensityFactor = clamp(0.45, 1.6, power / ftp)
    return roundToOne(durationHours * intensityFactor * intensityFactor * 100)
  }

  return roundToOne(durationHours * 35)
}

function getWeeklyRamp(points: DailyLoadPoint[], index: number): number {
  if (index < 13) {
    return 0
  }

  let latestWeek = 0
  let previousWeek = 0
  for (let offset = 0; offset < 7; offset++) {
    latestWeek += points[index - offset].effectiveStress
    previousWeek += points[index - 7 - offset].effectiveStress
  }

  return roundToOne(latestWeek - previousWeek)
}

export function buildDailyLoadSeries({ plan, rides, ftpFallback }: BuildDailyLoadSeriesOptions): DailyLoadPoint[] {
  const today = new Date()
  const planStart = new Date(plan.startDate)
  const planEnd = new Date(plan.endDate)

  const rideDates = rides
    .map((ride) => new Date(ride.date))
    .filter((date) => !Number.isNaN(date.getTime()))

  const rideStart = rideDates.length > 0 ? rideDates.reduce((min, date) => (date < min ? date : min), rideDates[0]) : planStart
  const rideEnd = rideDates.length > 0 ? rideDates.reduce((max, date) => (date > max ? date : max), rideDates[0]) : planEnd

  const start = new Date(Math.min(planStart.getTime(), rideStart.getTime()))
  const end = new Date(Math.max(planEnd.getTime(), rideEnd.getTime(), today.getTime()))

  const plannedByDate: Record<string, number> = {}
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const dateKey = formatDateKey(new Date(session.date))
      plannedByDate[dateKey] = roundToOne((plannedByDate[dateKey] || 0) + getPlannedSessionStress(session.type, session.duration))
    }
  }

  const completedByDate: Record<string, number> = {}
  for (const ride of rides) {
    const rideDate = new Date(ride.date)
    if (Number.isNaN(rideDate.getTime())) {
      continue
    }

    const dateKey = formatDateKey(rideDate)
    completedByDate[dateKey] = roundToOne((completedByDate[dateKey] || 0) + getRideStress(ride, ftpFallback))
  }

  const points: DailyLoadPoint[] = []
  let ctl = 0
  let atl = 0

  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    const dateKey = formatDateKey(current)
    const plannedStress = plannedByDate[dateKey] || 0
    const completedStress = completedByDate[dateKey] || 0
    const effectiveStress = completedStress > 0 ? completedStress : plannedStress

    atl += (effectiveStress - atl) / ATL_TIME_CONSTANT
    ctl += (effectiveStress - ctl) / CTL_TIME_CONSTANT
    const tsb = ctl - atl

    points.push({
      date: dateKey,
      plannedStress: roundToOne(plannedStress),
      completedStress: roundToOne(completedStress),
      effectiveStress: roundToOne(effectiveStress),
      ctl: roundToOne(ctl),
      atl: roundToOne(atl),
      tsb: roundToOne(tsb),
      ramp7d: 0,
    })
  }

  for (let index = 0; index < points.length; index++) {
    points[index].ramp7d = getWeeklyRamp(points, index)
  }

  return points
}

export function summarizeLoadSeries(points: DailyLoadPoint[]): LoadModelSummary {
  if (points.length === 0) {
    return {
      currentCtl: 0,
      currentAtl: 0,
      currentTsb: 0,
      currentRamp7d: 0,
      weeklyStressPlanned: 0,
      weeklyStressCompleted: 0,
      plannedStressNext7d: 0,
      projectedCtl7d: 0,
      projectedTsb7d: 0,
    }
  }

  const todayDate = new Date()
  const todayKey = formatDateKey(todayDate)
  const currentIndex = Math.max(0, points.findIndex((point) => point.date === todayKey))
  const currentPoint = points[currentIndex] || points[points.length - 1]
  const currentDate = dateFromKey(currentPoint.date)

  let weeklyStressPlanned = 0
  let weeklyStressCompleted = 0
  let plannedStressNext7d = 0

  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const pointDate = dateFromKey(point.date)
    const ageDays = Math.floor((currentDate.getTime() - pointDate.getTime()) / (24 * 60 * 60 * 1000))

    if (ageDays >= 0 && ageDays <= 6) {
      weeklyStressPlanned += point.plannedStress
      weeklyStressCompleted += point.completedStress
    }

    if (index > currentIndex && index <= currentIndex + 7) {
      plannedStressNext7d += point.plannedStress
    }
  }

  const projectedPoint = points[Math.min(points.length - 1, currentIndex + 7)]

  return {
    currentCtl: currentPoint.ctl,
    currentAtl: currentPoint.atl,
    currentTsb: currentPoint.tsb,
    currentRamp7d: currentPoint.ramp7d,
    weeklyStressPlanned: roundToOne(weeklyStressPlanned),
    weeklyStressCompleted: roundToOne(weeklyStressCompleted),
    plannedStressNext7d: roundToOne(plannedStressNext7d),
    projectedCtl7d: projectedPoint.ctl,
    projectedTsb7d: projectedPoint.tsb,
  }
}
