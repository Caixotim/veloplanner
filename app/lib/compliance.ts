import type { DailyLoadPoint, TrainingPlan, TrainingSession } from './types'

export type WeeklyCompliance = {
  weekNumber: number
  plannedSessions: number
  completedSessions: number
  completionPct: number
  keySessionCount: number
  keySessionsCompleted: number
  keySessionHitRate: number
  plannedStress: number
  completedStress: number
  stressDeltaPct: number
  status: 'good' | 'watch' | 'risk'
  statusReasons: string[]
}

type ComputeWeeklyComplianceOptions = {
  plan: TrainingPlan
  rides: Array<{
    date: number
    duration: number
  }>
  loadSeries: DailyLoadPoint[]
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

function isKeySession(session: TrainingSession): boolean {
  if (session.type === 'threshold' || session.type === 'vo2max' || session.type === 'anaerobic') {
    return true
  }

  return session.type === 'endurance' && session.duration >= 90
}

export function computeWeeklyCompliance({ plan, rides, loadSeries }: ComputeWeeklyComplianceOptions): WeeklyCompliance[] {
  const ridesByDate: Record<string, number> = {}
  for (const ride of rides) {
    const rideDate = new Date(ride.date)
    if (Number.isNaN(rideDate.getTime())) {
      continue
    }

    const dateKey = formatDateKey(rideDate)
    ridesByDate[dateKey] = (ridesByDate[dateKey] || 0) + 1
  }

  const stressByDate: Record<string, { planned: number; completed: number }> = {}
  for (const point of loadSeries) {
    stressByDate[point.date] = {
      planned: point.plannedStress,
      completed: point.completedStress,
    }
  }

  return plan.weeks.map((week) => {
    const plannedSessions = week.sessions.filter((session) => session.duration > 0).length
    const completedSessions = week.sessions.reduce((count, session) => {
      const dateKey = formatDateKey(new Date(session.date))
      return count + (ridesByDate[dateKey] ? 1 : 0)
    }, 0)

    const keySessions = week.sessions.filter(isKeySession)
    const keySessionsCompleted = keySessions.reduce((count, session) => {
      const dateKey = formatDateKey(new Date(session.date))
      return count + (ridesByDate[dateKey] ? 1 : 0)
    }, 0)

    let plannedStress = 0
    let completedStress = 0
    for (const session of week.sessions) {
      const dateKey = formatDateKey(new Date(session.date))
      const stressPoint = stressByDate[dateKey]
      if (!stressPoint) {
        continue
      }

      plannedStress += stressPoint.planned
      completedStress += stressPoint.completed
    }

    const completionPct = plannedSessions > 0 ? (completedSessions / plannedSessions) * 100 : 0
    const keySessionHitRate = keySessions.length > 0 ? (keySessionsCompleted / keySessions.length) * 100 : 0
    const stressDeltaPct = plannedStress > 0 ? ((completedStress - plannedStress) / plannedStress) * 100 : 0

    const riskReasons: string[] = []
    const watchReasons: string[] = []

    if (completionPct < 60) {
      riskReasons.push(`Low completion (${roundToOne(completionPct)}% < 60%)`)
    } else if (completionPct < 85) {
      watchReasons.push(`Completion below target (${roundToOne(completionPct)}% < 85%)`)
    }

    if (keySessionHitRate < 50) {
      riskReasons.push(`Key sessions missed (${roundToOne(keySessionHitRate)}% < 50%)`)
    } else if (keySessionHitRate < 80) {
      watchReasons.push(`Key session hit rate below target (${roundToOne(keySessionHitRate)}% < 80%)`)
    }

    if (stressDeltaPct <= -35) {
      riskReasons.push(`Stress load far under plan (${roundToOne(stressDeltaPct)}% <= -35%)`)
    } else if (stressDeltaPct >= 40) {
      riskReasons.push(`Stress load far over plan (${roundToOne(stressDeltaPct)}% >= 40%)`)
    } else if (stressDeltaPct < -20 || stressDeltaPct > 20) {
      watchReasons.push(`Stress load outside ideal band (${roundToOne(stressDeltaPct)}%, target -20% to +20%)`)
    }

    const status: WeeklyCompliance['status'] = riskReasons.length > 0 ? 'risk' : watchReasons.length > 0 ? 'watch' : 'good'
    const statusReasons = status === 'risk' ? riskReasons : status === 'watch' ? watchReasons : ['All compliance thresholds met']

    return {
      weekNumber: week.weekNumber,
      plannedSessions,
      completedSessions,
      completionPct: roundToOne(completionPct),
      keySessionCount: keySessions.length,
      keySessionsCompleted,
      keySessionHitRate: roundToOne(keySessionHitRate),
      plannedStress: roundToOne(plannedStress),
      completedStress: roundToOne(completedStress),
      stressDeltaPct: roundToOne(stressDeltaPct),
      status,
      statusReasons,
    }
  })
}
