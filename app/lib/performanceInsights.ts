import type { DailyLoadPoint, TrainingPlan } from './types'

type RidePoint = {
  date: number
  maxPower: number
  avgPower?: number
  normalizedPower?: number
  ftpWatts?: number
  duration: number
}

export type SessionExecutionRow = {
  sessionId: string
  date: string
  sessionType: string
  plannedStress: number
  completedStress: number
  executionScore: number
  status: 'good' | 'watch' | 'risk'
}

export type SessionExecutionSummary = {
  weeklyAvgScore: number
  recentRows: SessionExecutionRow[]
  trendRows: Array<{
    date: string
    executionScore: number
    plannedStress: number
    completedStress: number
  }>
}

export type PeakDurationKey = '5s' | '1m' | '5m' | '20m'

export type PeakProgressionRow = {
  duration: PeakDurationKey
  earlierBest: number
  recentBest: number
  deltaPct: number
}

export type PeakProgressionSummary = {
  rows: PeakProgressionRow[]
  status: 'improving' | 'mixed' | 'flat'
}

export type TaperAdvisor = {
  status: 'on_track' | 'under_recovered' | 'too_fresh' | 'loading_risk'
  headline: string
  detail: string
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

function sessionLabel(sessionType: string): string {
  return sessionType.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
}

function estimateDurationPower(ride: RidePoint, duration: PeakDurationKey): number {
  const maxPower = Math.max(0, ride.maxPower || 0)
  const normalized = Math.max(0, ride.normalizedPower || 0)
  const avgPower = Math.max(0, ride.avgPower || 0)
  const ftp = Math.max(0, ride.ftpWatts || 0)

  if (duration === '5s') {
    return maxPower
  }

  if (duration === '1m') {
    return maxPower > 0 ? maxPower * 0.92 : normalized
  }

  if (duration === '5m') {
    const fromSprint = maxPower > 0 ? maxPower * 0.82 : 0
    const fromSteady = normalized > 0 ? normalized * 1.1 : 0
    return Math.max(fromSprint, fromSteady)
  }

  if (ftp > 0) {
    return ftp
  }
  if (normalized > 0) {
    return normalized * 0.95
  }
  return avgPower > 0 ? avgPower * 0.9 : 0
}

export function computeSessionExecutionSummary(plan: TrainingPlan, loadSeries: DailyLoadPoint[]): SessionExecutionSummary {
  const stressByDate: Record<string, { planned: number; completed: number }> = {}
  for (const point of loadSeries) {
    stressByDate[point.date] = {
      planned: point.plannedStress,
      completed: point.completedStress,
    }
  }

  const rows: SessionExecutionRow[] = []
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (session.duration <= 0) {
        continue
      }

      const dateKey = formatDateKey(new Date(session.date))
      const stressPoint = stressByDate[dateKey]
      const plannedStress = stressPoint?.planned || 0
      const completedStress = stressPoint?.completed || 0
      const deltaPct = plannedStress > 0 ? Math.abs(completedStress - plannedStress) / plannedStress : completedStress > 0 ? 0.4 : 0
      const executionScore = Math.max(0, Math.min(100, 100 - deltaPct * 100))
      const status: SessionExecutionRow['status'] = executionScore >= 85 ? 'good' : executionScore >= 65 ? 'watch' : 'risk'

      rows.push({
        sessionId: session.id,
        date: dateKey,
        sessionType: sessionLabel(session.type),
        plannedStress: roundToOne(plannedStress),
        completedStress: roundToOne(completedStress),
        executionScore: roundToOne(executionScore),
        status,
      })
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1))

  const today = new Date()
  let weeklyScoreTotal = 0
  let weeklyCount = 0
  for (const row of rows) {
    const rowDate = dateFromKey(row.date)
    const ageDays = Math.floor((today.getTime() - rowDate.getTime()) / (24 * 60 * 60 * 1000))
    if (ageDays >= 0 && ageDays <= 6) {
      weeklyScoreTotal += row.executionScore
      weeklyCount += 1
    }
  }

  return {
    weeklyAvgScore: weeklyCount > 0 ? roundToOne(weeklyScoreTotal / weeklyCount) : 0,
    recentRows: rows.slice(0, 6),
    trendRows: rows
      .slice(0, 12)
      .reverse()
      .map((row) => ({
        date: row.date.slice(5),
        executionScore: row.executionScore,
        plannedStress: row.plannedStress,
        completedStress: row.completedStress,
      })),
  }
}

export function computePeakProgressionSummary(rides: RidePoint[]): PeakProgressionSummary {
  const validRides = rides
    .map((ride) => ({ ...ride, ts: new Date(ride.date).getTime() }))
    .filter((ride) => Number.isFinite(ride.ts))
    .sort((a, b) => a.ts - b.ts)

  if (validRides.length < 4) {
    return {
      rows: [
        { duration: '5s', earlierBest: 0, recentBest: 0, deltaPct: 0 },
        { duration: '1m', earlierBest: 0, recentBest: 0, deltaPct: 0 },
        { duration: '5m', earlierBest: 0, recentBest: 0, deltaPct: 0 },
        { duration: '20m', earlierBest: 0, recentBest: 0, deltaPct: 0 },
      ],
      status: 'flat',
    }
  }

  const split = Math.floor(validRides.length / 2)
  const earlier = validRides.slice(0, split)
  const recent = validRides.slice(split)
  const durations: PeakDurationKey[] = ['5s', '1m', '5m', '20m']

  const rows = durations.map((duration) => {
    const earlierBest = earlier.reduce((max, ride) => Math.max(max, estimateDurationPower(ride, duration)), 0)
    const recentBest = recent.reduce((max, ride) => Math.max(max, estimateDurationPower(ride, duration)), 0)
    const deltaPct = earlierBest > 0 ? ((recentBest - earlierBest) / earlierBest) * 100 : 0

    return {
      duration,
      earlierBest: roundToOne(earlierBest),
      recentBest: roundToOne(recentBest),
      deltaPct: roundToOne(deltaPct),
    }
  })

  const positive = rows.filter((row) => row.deltaPct >= 2).length
  const negative = rows.filter((row) => row.deltaPct <= -2).length
  const status: PeakProgressionSummary['status'] = positive >= 3 ? 'improving' : negative >= 3 ? 'flat' : 'mixed'

  return { rows, status }
}

type ComputeTaperAdvisorOptions = {
  goal: TrainingPlan['goal']
  weeksToPlanEnd: number
  currentTsb: number
  projectedTsb7d: number
  currentRamp7d: number
}

export function computeTaperAdvisor({ goal, weeksToPlanEnd, currentTsb, projectedTsb7d, currentRamp7d }: ComputeTaperAdvisorOptions): TaperAdvisor {
  const goalLabel = goal.replace(/_/g, ' ')
  const highFormUpper = goal === 'recovery' ? 15 : goal === 'endurance' ? 12 : 9
  const lowFormFloor = goal === 'recovery' ? -4 : goal === 'endurance' ? -7 : -8

  if (weeksToPlanEnd <= 3 && projectedTsb7d < -8) {
    return {
      status: 'under_recovered',
      headline: 'Taper Risk: Entering Key Weeks Fatigued',
      detail:
        goal === 'endurance'
          ? `Projected form in 7 days is ${projectedTsb7d.toFixed(1)}. Reduce volume 10-15% while keeping one long aerobic ride to preserve durability.`
          : `Projected form in 7 days is ${projectedTsb7d.toFixed(1)}. Reduce load 10-20% to arrive fresher for high-quality ${goalLabel} work.`,
    }
  }

  if (weeksToPlanEnd <= 3 && projectedTsb7d > highFormUpper) {
    return {
      status: 'too_fresh',
      headline: 'Taper Risk: Possibly Detraining',
      detail:
        goal === 'ftp_increase'
          ? `Projected form in 7 days is ${projectedTsb7d.toFixed(1)}. Keep one threshold set (for example 2x10-12 min) to protect FTP stimulus.`
          : goal === 'climbing_sustainability'
          ? `Projected form in 7 days is ${projectedTsb7d.toFixed(1)}. Add one climbing-specific sustained interval session to maintain specificity.`
          : `Projected form in 7 days is ${projectedTsb7d.toFixed(1)}. Keep one quality workout to avoid losing sharpness.`,
    }
  }

  if (currentRamp7d > 140 || (currentTsb < -10 && currentRamp7d > 90)) {
    return {
      status: 'loading_risk',
      headline: 'Loading Risk: Fatigue May Outpace Adaptation',
      detail: `Current ramp is ${currentRamp7d.toFixed(1)} with TSB ${currentTsb.toFixed(1)}. Insert recovery before the next hard block.`,
    }
  }

  return {
    status: 'on_track',
    headline: 'Taper Outlook: On Track',
    detail: `Current TSB ${currentTsb.toFixed(1)} and projected TSB ${projectedTsb7d.toFixed(1)} are in the ${lowFormFloor.toFixed(0)} to +${highFormUpper.toFixed(0)} target range for ${goalLabel}.`,
  }
}