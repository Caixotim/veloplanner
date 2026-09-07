export type WorkoutProfileStep = {
  id: string
  minutes: number
  target: string
  note: string
}

export type WorkoutProfileVisualStep = WorkoutProfileStep & {
  intensityPercent: number
  zone: string
  color: string
  height: number
}

export type WorkoutProfileSummary = {
  totalMinutes: number
  qualityMinutes: number
  recoveryMinutes: number
  averageIntensityPercent: number
}

export type WorkoutProfileOptions = {
  fallback?: boolean
}

const DEFAULT_PROFILE_STEPS: WorkoutProfileStep[] = [
  { id: 'step_1', minutes: 10, target: 'easy', note: 'Warm-up' },
  { id: 'step_2', minutes: 20, target: 'steady', note: 'Main set' },
]

export function parseWorkoutProfileSteps(lines?: string[], options: WorkoutProfileOptions = {}): WorkoutProfileStep[] {
  const source = (lines || [])
    .flatMap((line) => line.split('|'))
    .filter((line) => !line.toLowerCase().startsWith('workout level'))

  const parsed = source
    .map((line, index) => {
      const durationMatch = line.match(/(\d+)\s*'/)
      if (!durationMatch) {
        return null
      }

      const minutes = parseInt(durationMatch[1], 10)
      const [first, ...rest] = line.split(' at ')
      const target = rest.length > 0 ? rest.join(' at ').trim() : ''
      return {
        id: `step_${index + 1}`,
        minutes,
        target: target || 'steady',
        note: first.replace(/\s*\d+\s*'\s*$/, '').replace(/^[\d\s×xX']+/, '').replace(/^[^A-Za-z0-9]+/, '').trim() || 'main set',
      }
    })
    .filter((step): step is WorkoutProfileStep => Boolean(step && step.minutes > 0))

  if (parsed.length > 0) {
    return parsed
  }

  return options.fallback === false ? [] : DEFAULT_PROFILE_STEPS.map((step) => ({ ...step }))
}

export function getWorkoutIntensityPercent(target: string): number {
  const percentages = [...target.matchAll(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*%/g)].flatMap((match) => [
    Number(match[1]),
    ...(match[2] ? [Number(match[2])] : []),
  ])
  if (percentages.length > 0) {
    return percentages.reduce((sum, value) => sum + value, 0) / percentages.length
  }

  const normalized = target.toLowerCase()
  if (/(?:max|all[- ]out|sprint)/.test(normalized)) return 125
  if (/(?:very hard|vo2|anaerobic)/.test(normalized)) return 112
  if (/(?:hard|threshold)/.test(normalized)) return 100
  if (/(?:easy|recovery|warm[- ]?up|cool[- ]?down)/.test(normalized)) return 58
  return 75
}

export function getWorkoutZone(target: string, hasPowerMeter: boolean): string {
  const percentage = getWorkoutIntensityPercent(target)

  if (hasPowerMeter) {
    if (percentage <= 55) return 'Z1'
    if (percentage <= 75) return 'Z2'
    if (percentage <= 90) return 'Z3'
    if (percentage <= 105) return 'Z4'
    return 'Z5'
  }

  if (percentage <= 68) return 'Z1'
  if (percentage <= 83) return 'Z2'
  if (percentage <= 94) return 'Z3'
  if (percentage <= 105) return 'Z4'
  return 'Z5'
}

export function getWorkoutZoneColor(target: string, hasPowerMeter: boolean, zoneColors?: string[]): string {
  const zoneIndex = Number(getWorkoutZone(target, hasPowerMeter).replace('Z', '')) - 1
  return zoneColors?.[zoneIndex] || ['#82c7a5', '#69b7d6', '#e8c15a', '#e88b50', '#d95d5d'][zoneIndex] || '#69b7d6'
}

export function getWorkoutIntensityHeight(target: string): number {
  const intensity = getWorkoutIntensityPercent(target)
  return Math.max(18, Math.min(100, 18 + ((intensity - 45) / 85) * 82))
}

export function buildWorkoutProfileVisualSteps(
  steps: WorkoutProfileStep[],
  hasPowerMeter: boolean,
  zoneColors?: string[]
): WorkoutProfileVisualStep[] {
  return steps.map((step) => ({
    ...step,
    intensityPercent: getWorkoutIntensityPercent(step.target),
    zone: getWorkoutZone(step.target, hasPowerMeter),
    color: getWorkoutZoneColor(step.target, hasPowerMeter, zoneColors),
    height: getWorkoutIntensityHeight(step.target),
  }))
}

export function summarizeWorkoutProfile(steps: WorkoutProfileStep[]): WorkoutProfileSummary {
  const totalMinutes = steps.reduce((sum, step) => sum + Math.max(0, step.minutes), 0)
  const qualityMinutes = steps.reduce(
    (sum, step) => sum + (getWorkoutIntensityPercent(step.target) >= 90 ? Math.max(0, step.minutes) : 0),
    0
  )
  const recoveryMinutes = steps.reduce(
    (sum, step) => sum + (getWorkoutIntensityPercent(step.target) <= 65 ? Math.max(0, step.minutes) : 0),
    0
  )
  const averageIntensityPercent = totalMinutes
    ? steps.reduce((sum, step) => sum + getWorkoutIntensityPercent(step.target) * Math.max(0, step.minutes), 0) / totalMinutes
    : 0

  return {
    totalMinutes,
    qualityMinutes,
    recoveryMinutes,
    averageIntensityPercent: Math.round(averageIntensityPercent * 10) / 10,
  }
}
