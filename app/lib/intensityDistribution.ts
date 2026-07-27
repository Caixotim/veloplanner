import type { SessionType, TrainingPlan } from './types'

type RidePoint = {
  duration: number
  avgPower?: number
  normalizedPower?: number
  ftpWatts?: number
}

type ZoneKey = 'z1' | 'z2' | 'z3' | 'z4' | 'z5'

type ZoneBucket = {
  key: ZoneKey
  label: string
  plannedMinutes: number
  completedMinutes: number
  plannedPct: number
  completedPct: number
}

export type PolarizationStatus = 'aligned' | 'drifted' | 'insufficient'

export type IntensityDistribution = {
  zones: ZoneBucket[]
  plannedLowPct: number
  plannedMidPct: number
  plannedHighPct: number
  completedLowPct: number
  completedMidPct: number
  completedHighPct: number
  status: PolarizationStatus
  insights: string[]
}

type ComputeIntensityDistributionOptions = {
  plan: TrainingPlan
  rides: RidePoint[]
  ftpFallback?: number
}

const ZONES: Array<{ key: ZoneKey; label: string }> = [
  { key: 'z1', label: 'Z1 Recovery' },
  { key: 'z2', label: 'Z2 Endurance' },
  { key: 'z3', label: 'Z3 Tempo' },
  { key: 'z4', label: 'Z4 Threshold' },
  { key: 'z5', label: 'Z5 VO2+' },
]

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

function mapSessionToZone(sessionType: SessionType): ZoneKey {
  if (sessionType === 'recovery') return 'z1'
  if (sessionType === 'endurance') return 'z2'
  if (sessionType === 'tempo') return 'z3'
  if (sessionType === 'threshold') return 'z4'
  if (sessionType === 'vo2max' || sessionType === 'anaerobic') return 'z5'
  return 'z2'
}

function mapRideToZone(ride: RidePoint, ftpFallback?: number): ZoneKey {
  const power = ride.avgPower || ride.normalizedPower || 0
  const ftp = ride.ftpWatts || ftpFallback || 0

  if (power > 0 && ftp > 0) {
    const ratio = power / ftp
    if (ratio < 0.55) return 'z1'
    if (ratio < 0.75) return 'z2'
    if (ratio < 0.9) return 'z3'
    if (ratio < 1.05) return 'z4'
    return 'z5'
  }

  return (ride.duration || 0) >= 90 ? 'z2' : 'z1'
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0
  return (value / total) * 100
}

export function computeIntensityDistribution({ plan, rides, ftpFallback }: ComputeIntensityDistributionOptions): IntensityDistribution {
  const plannedMinutes: Record<ZoneKey, number> = {
    z1: 0,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0,
  }
  const completedMinutes: Record<ZoneKey, number> = {
    z1: 0,
    z2: 0,
    z3: 0,
    z4: 0,
    z5: 0,
  }

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const minutes = Math.max(0, session.duration || 0)
      if (minutes <= 0) continue

      const zone = mapSessionToZone(session.type)
      plannedMinutes[zone] += minutes
    }
  }

  for (const ride of rides) {
    const minutes = Math.max(0, ride.duration || 0)
    if (minutes <= 0) continue

    const zone = mapRideToZone(ride, ftpFallback)
    completedMinutes[zone] += minutes
  }

  const totalPlanned = Object.values(plannedMinutes).reduce((sum, value) => sum + value, 0)
  const totalCompleted = Object.values(completedMinutes).reduce((sum, value) => sum + value, 0)

  const zones: ZoneBucket[] = ZONES.map((zone) => ({
    key: zone.key,
    label: zone.label,
    plannedMinutes: roundToOne(plannedMinutes[zone.key]),
    completedMinutes: roundToOne(completedMinutes[zone.key]),
    plannedPct: roundToOne(toPercent(plannedMinutes[zone.key], totalPlanned)),
    completedPct: roundToOne(toPercent(completedMinutes[zone.key], totalCompleted)),
  }))

  const plannedLowPct = roundToOne(toPercent(plannedMinutes.z1 + plannedMinutes.z2, totalPlanned))
  const plannedMidPct = roundToOne(toPercent(plannedMinutes.z3, totalPlanned))
  const plannedHighPct = roundToOne(toPercent(plannedMinutes.z4 + plannedMinutes.z5, totalPlanned))

  const completedLowPct = roundToOne(toPercent(completedMinutes.z1 + completedMinutes.z2, totalCompleted))
  const completedMidPct = roundToOne(toPercent(completedMinutes.z3, totalCompleted))
  const completedHighPct = roundToOne(toPercent(completedMinutes.z4 + completedMinutes.z5, totalCompleted))

  const insufficientData = totalCompleted < 180
  const inPolarizedRange = completedLowPct >= 70 && completedLowPct <= 90 && completedHighPct >= 10 && completedHighPct <= 25 && completedMidPct <= 20
  const status: PolarizationStatus = insufficientData ? 'insufficient' : inPolarizedRange ? 'aligned' : 'drifted'

  const insights: string[] = []
  if (insufficientData) {
    insights.push('Not enough completed ride time yet for a reliable intensity-distribution read.')
  } else {
    if (completedMidPct > 25) {
      insights.push(`Tempo-heavy execution (${completedMidPct.toFixed(1)}%) may be replacing low and high quality work.`)
    }
    if (completedHighPct < 8) {
      insights.push(`High-intensity dose is low (${completedHighPct.toFixed(1)}%). Add at least one focused threshold/VO2 session.`)
    }
    if (completedHighPct > 30) {
      insights.push(`High-intensity share is very high (${completedHighPct.toFixed(1)}%). Add recovery to avoid overreaching.`)
    }
    if (completedLowPct < 65) {
      insights.push(`Aerobic base volume is low (${completedLowPct.toFixed(1)}%). Increase easy endurance minutes.`)
    }
    if (completedLowPct > 92) {
      insights.push('Most training is easy; maintain quality intensity so progression does not stall.')
    }
  }

  if (insights.length === 0) {
    insights.push('Intensity mix is balanced and consistent with polarized endurance training guidance.')
  }

  return {
    zones,
    plannedLowPct,
    plannedMidPct,
    plannedHighPct,
    completedLowPct,
    completedMidPct,
    completedHighPct,
    status,
    insights: insights.slice(0, 2),
  }
}