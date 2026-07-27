import type { DailyLoadPoint } from './types'

export type WeeklyRampPoint = {
  label: string
  weeklyLoad: number
  ramp: number
  status: 'optimal' | 'caution' | 'overload' | 'deload'
}

export type RampGuidance = {
  currentWeeklyLoad: number
  recommendedMin: number
  recommendedMax: number
  status: 'optimal' | 'caution' | 'overload' | 'deload'
  guidance: string
}

const OPTIMAL_RAMP_MIN = 0
const OPTIMAL_RAMP_MAX = 120
const CAUTION_RAMP_MAX = 200
const DELOAD_RAMP_MIN = -200

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 6, 0, 0, 0)
}

export function computeWeeklyRampTimeline(loadSeries: DailyLoadPoint[]): WeeklyRampPoint[] {
  if (loadSeries.length === 0) {
    return []
  }

  // Bucket effective stress per week
  const weeklyLoads: number[] = []
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const firstDate = dateFromKey(loadSeries[0].date)

  for (const point of loadSeries) {
    const pointDate = dateFromKey(point.date)
    const weekIndex = Math.floor((pointDate.getTime() - firstDate.getTime()) / msPerWeek)
    while (weeklyLoads.length <= weekIndex) {
      weeklyLoads.push(0)
    }

    weeklyLoads[weekIndex] += point.effectiveStress
  }

  return weeklyLoads
    .slice(-16)
    .map((load, index, arr) => {
      const rounded = roundToOne(load)
      const prev = arr[index - 1] ?? 0
      const ramp = roundToOne(load - prev)

      const status: WeeklyRampPoint['status'] =
        ramp > CAUTION_RAMP_MAX
          ? 'overload'
          : ramp < DELOAD_RAMP_MIN
          ? 'deload'
          : ramp > OPTIMAL_RAMP_MAX
          ? 'caution'
          : 'optimal'

      return {
        label: `W${weeklyLoads.length - arr.length + index + 1}`,
        weeklyLoad: rounded,
        ramp,
        status,
      }
    })
}

export function computeRampGuidance(
  loadSeries: DailyLoadPoint[],
  currentCtl: number
): RampGuidance {
  const recent = loadSeries.slice(-14)
  const lastWeek = recent.slice(-7)
  const prevWeek = recent.slice(-14, -7)

  const lastWeekLoad = roundToOne(lastWeek.reduce((sum, p) => sum + p.effectiveStress, 0))
  const prevWeekLoad = roundToOne(prevWeek.reduce((sum, p) => sum + p.effectiveStress, 0))

  const ramp = roundToOne(lastWeekLoad - prevWeekLoad)
  const baseline = prevWeekLoad > 0 ? prevWeekLoad : Math.max(40, currentCtl * 7)

  // Recommended load band: +0% to +10% from previous week, with CTL floor
  const recommendedMin = roundToOne(Math.max(baseline * 0.9, currentCtl * 6))
  const recommendedMax = roundToOne(Math.min(baseline * 1.10, currentCtl * 9))

  const status: RampGuidance['status'] =
    ramp > CAUTION_RAMP_MAX
      ? 'overload'
      : ramp < DELOAD_RAMP_MIN
      ? 'deload'
      : ramp > OPTIMAL_RAMP_MAX
      ? 'caution'
      : 'optimal'

  const guidance =
    status === 'overload'
      ? `This week's load jumped ${ramp.toFixed(0)} pts above last week. Insert a recovery day or reduce intensity to avoid overreaching.`
      : status === 'caution'
      ? `Load is rising faster than the optimal band (${ramp.toFixed(0)} pts). Monitor fatigue and keep easy sessions truly easy.`
      : status === 'deload'
      ? `Load dropped sharply (${ramp.toFixed(0)} pts). This is a recovery week or missed sessions — make sure it is intentional.`
      : `Current load progression is within the optimal band (${ramp.toFixed(0)} pts change). Keep the current pattern.`

  return {
    currentWeeklyLoad: lastWeekLoad,
    recommendedMin,
    recommendedMax,
    status,
    guidance,
  }
}
