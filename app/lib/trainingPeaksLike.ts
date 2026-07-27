import type { DailyLoadPoint, SessionType, TrainingPlan } from './types'

export type WeeklyStressTimelinePoint = {
  label: string
  plannedStress: number
  completedStress: number
  completionPct: number
}

export type SessionTypeExecutionPoint = {
  type: SessionType
  label: string
  plannedStress: number
  completedStress: number
  executionPct: number
  status: 'good' | 'watch' | 'risk'
}

export type ReadinessZoneDistribution = {
  freshDays: number
  balancedDays: number
  heavyDays: number
  totalDays: number
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

function sessionTypeLabel(type: SessionType): string {
  return type.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
}

export function computeWeeklyStressTimeline(plan: TrainingPlan, loadSeries: DailyLoadPoint[]): WeeklyStressTimelinePoint[] {
  const weekBuckets: Array<{ planned: number; completed: number }> = Array.from({ length: plan.durationWeeks }, () => ({
    planned: 0,
    completed: 0,
  }))

  const planStart = new Date(plan.startDate)
  const msPerDay = 24 * 60 * 60 * 1000

  for (const point of loadSeries) {
    const date = dateFromKey(point.date)
    const dayOffset = Math.floor((date.getTime() - planStart.getTime()) / msPerDay)
    if (dayOffset < 0) {
      continue
    }

    const weekIndex = Math.floor(dayOffset / 7)
    if (weekIndex < 0 || weekIndex >= weekBuckets.length) {
      continue
    }

    weekBuckets[weekIndex].planned += point.plannedStress
    weekBuckets[weekIndex].completed += point.completedStress
  }

  return weekBuckets.map((bucket, index) => {
    const plannedStress = roundToOne(bucket.planned)
    const completedStress = roundToOne(bucket.completed)
    const completionPct = plannedStress > 0 ? roundToOne((completedStress / plannedStress) * 100) : 0
    return {
      label: `W${index + 1}`,
      plannedStress,
      completedStress,
      completionPct,
    }
  })
}

export function computeSessionTypeExecution(plan: TrainingPlan, loadSeries: DailyLoadPoint[]): SessionTypeExecutionPoint[] {
  const stressByDate: Record<string, { planned: number; completed: number }> = {}
  for (const point of loadSeries) {
    stressByDate[point.date] = {
      planned: point.plannedStress,
      completed: point.completedStress,
    }
  }

  const grouped: Record<SessionType, { planned: number; completed: number }> = {
    endurance: { planned: 0, completed: 0 },
    tempo: { planned: 0, completed: 0 },
    threshold: { planned: 0, completed: 0 },
    vo2max: { planned: 0, completed: 0 },
    anaerobic: { planned: 0, completed: 0 },
    strength: { planned: 0, completed: 0 },
    recovery: { planned: 0, completed: 0 },
  }

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (session.duration <= 0) {
        continue
      }

      const dateKey = formatDateKey(new Date(session.date))
      const point = stressByDate[dateKey]
      grouped[session.type].planned += point?.planned || 0
      grouped[session.type].completed += point?.completed || 0
    }
  }

  const order: SessionType[] = ['endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic', 'strength', 'recovery']
  return order
    .map((type) => {
      const plannedStress = roundToOne(grouped[type].planned)
      const completedStress = roundToOne(grouped[type].completed)
      const executionPct = plannedStress > 0 ? roundToOne((completedStress / plannedStress) * 100) : 0
      const status: SessionTypeExecutionPoint['status'] = executionPct >= 85 ? 'good' : executionPct >= 60 ? 'watch' : 'risk'
      return {
        type,
        label: sessionTypeLabel(type),
        plannedStress,
        completedStress,
        executionPct,
        status,
      }
    })
    .filter((point) => point.plannedStress > 0 || point.completedStress > 0)
}

export function computeReadinessZoneDistribution(loadSeries: DailyLoadPoint[], days = 28): ReadinessZoneDistribution {
  if (loadSeries.length === 0) {
    return {
      freshDays: 0,
      balancedDays: 0,
      heavyDays: 0,
      totalDays: 0,
    }
  }

  const latest = loadSeries[loadSeries.length - 1]
  const latestDate = dateFromKey(latest.date)
  let freshDays = 0
  let balancedDays = 0
  let heavyDays = 0

  for (const point of loadSeries) {
    const pointDate = dateFromKey(point.date)
    const ageDays = Math.floor((latestDate.getTime() - pointDate.getTime()) / (24 * 60 * 60 * 1000))
    if (ageDays < 0 || ageDays >= days) {
      continue
    }

    if (point.tsb >= 5) {
      freshDays += 1
    } else if (point.tsb <= -10) {
      heavyDays += 1
    } else {
      balancedDays += 1
    }
  }

  return {
    freshDays,
    balancedDays,
    heavyDays,
    totalDays: freshDays + balancedDays + heavyDays,
  }
}

// ─── Race Prep ─────────────────────────────────────────────────────────────

export type TaperStage = 'heavy_training' | 'sharpening' | 'race_week' | 'event_day' | 'past'

export type RacePrepChecklistItem = {
  label: string
  status: 'done' | 'pending' | 'na'
}

export type EventWindowCompliance = {
  plannedKeySessions: number
  completedKeySessions: number
  completionPct: number
}

export type RacePrepStatus = {
  eventId: string
  eventName: string
  eventDate: string
  priority: string
  daysToEvent: number
  taperStage: TaperStage
  checklist: RacePrepChecklistItem[]
  windowCompliance: EventWindowCompliance
  projectedTsb: number | undefined
}

type PlannedEventInput = {
  id: string
  name: string
  date: string
  priority: string
}

type RaceRideInput = {
  date: number
  duration: number
}

function isKeySessionForRacePrep(type: SessionType): boolean {
  return type === 'threshold' || type === 'vo2max' || type === 'anaerobic'
}

function getTaperStage(daysToEvent: number): TaperStage {
  if (daysToEvent < 0) return 'past'
  if (daysToEvent === 0) return 'event_day'
  if (daysToEvent <= 7) return 'race_week'
  if (daysToEvent <= 14) return 'sharpening'
  return 'heavy_training'
}

function buildRaceChecklist(
  stage: TaperStage,
  compliance: EventWindowCompliance,
  projectedTsb: number
): RacePrepChecklistItem[] {
  const items: RacePrepChecklistItem[] = [
    {
      label: `Key sessions done: ${compliance.completedKeySessions}/${compliance.plannedKeySessions} (${compliance.completionPct.toFixed(0)}%)`,
      status: compliance.completionPct >= 75 ? 'done' : 'pending',
    },
  ]

  if (stage === 'heavy_training') {
    items.push(
      { label: 'Build phase progressing on schedule', status: 'pending' },
      { label: 'Recovery week planned within 3 weeks of event', status: 'pending' }
    )
  } else if (stage === 'sharpening') {
    items.push(
      { label: 'One quality session remaining this week', status: 'pending' },
      { label: 'Fatigue reducing toward event', status: projectedTsb >= -6 ? 'done' : 'pending' },
      { label: 'Race-day nutrition strategy confirmed', status: 'pending' }
    )
  } else if (stage === 'race_week' || stage === 'event_day') {
    items.push(
      { label: 'Final activation ride completed', status: 'pending' },
      {
        label: 'Form near positive TSB',
        status: projectedTsb >= 0 ? 'done' : projectedTsb >= -5 ? 'pending' : 'na',
      },
      { label: 'Equipment checked and ready', status: 'pending' },
      { label: 'Logistics confirmed', status: 'pending' },
      { label: 'Race-day nutrition locked', status: 'pending' }
    )
  }

  return items
}

export function computeRacePrepStatuses(
  plan: TrainingPlan,
  rides: RaceRideInput[],
  loadSeries: DailyLoadPoint[],
  plannedEvents: PlannedEventInput[]
): RacePrepStatus[] {
  if (!plannedEvents || plannedEvents.length === 0) {
    return []
  }

  const today = new Date()
  const completedDates = new Set<string>()
  for (const ride of rides) {
    const rideDate = new Date(ride.date)
    if (!Number.isNaN(rideDate.getTime())) {
      completedDates.add(formatDateKey(rideDate))
    }
  }

  const tsbByDate = new Map(loadSeries.map((point) => [point.date, point.tsb]))

  return plannedEvents
    .filter((event) => Boolean(event.name) && Boolean(event.date))
    .map((event) => {
      const eventDate = new Date(event.date)
      if (Number.isNaN(eventDate.getTime())) {
        return null
      }

      const daysToEvent = Math.floor((eventDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      const stage = getTaperStage(daysToEvent)

      const windowStart = new Date(eventDate.getTime() - 28 * 24 * 60 * 60 * 1000)
      let plannedKeySessions = 0
      let completedKeySessions = 0

      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          if (!isKeySessionForRacePrep(session.type) || session.duration <= 0) {
            continue
          }
          const sessionDate = new Date(session.date)
          if (sessionDate < windowStart || sessionDate > eventDate) {
            continue
          }
          plannedKeySessions += 1
          if (completedDates.has(formatDateKey(sessionDate))) {
            completedKeySessions += 1
          }
        }
      }

      const completionPct =
        plannedKeySessions > 0 ? roundToOne((completedKeySessions / plannedKeySessions) * 100) : 0

      const windowCompliance: EventWindowCompliance = {
        plannedKeySessions,
        completedKeySessions,
        completionPct,
      }

      const projectedTsb = tsbByDate.get(event.date)
      const checklist = buildRaceChecklist(stage, windowCompliance, projectedTsb ?? 0)

      return {
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
        priority: event.priority,
        daysToEvent,
        taperStage: stage,
        checklist,
        windowCompliance,
        projectedTsb,
      }
    })
    .filter((item): item is RacePrepStatus => item !== null)
    .sort((a, b) => a.daysToEvent - b.daysToEvent)
}