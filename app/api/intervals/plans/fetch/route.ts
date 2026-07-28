import type { TrainingPlan, TrainingSession, TrainingWeek } from '@/app/lib/types'
import { getIntervalsConfigFromRequest, hasIntervalsConfig, intervalsRequest, toLocalIsoDate } from '../../_utils'

type IntervalsEvent = {
  id?: number
  uid?: string
  external_id?: string
  name?: string
  description?: string
  start_date_local?: string
  end_date_local?: string
  moving_time?: number
  category?: string
}

type PlansResponse = {
  success: boolean
  plans?: TrainingPlan[]
  count?: number
  error?: string
}

/**
 * Fetch training plans that were previously synced to Intervals.icu
 * Plans are stored as events with external_id in format: ${planId}:${sessionId}
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const config = getIntervalsConfigFromRequest(request)
    if (!hasIntervalsConfig(config)) {
      return Response.json(
        {
          success: false,
          error: 'Intervals.icu credentials missing. Connect Intervals.icu and save API key + athlete ID.',
          plans: [],
        },
        { status: 200 }
      )
    }

    // Fetch all events from Intervals.icu with pagination
    const allEvents: IntervalsEvent[] = []
    const pageSize = 500
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const response = await intervalsRequest(
        `/api/v1/athlete/${config.athleteId}/events?limit=${pageSize}&offset=${offset}`,
        {},
        config
      )
      const events = (await response.json()) as IntervalsEvent[]
      allEvents.push(...events)

      if (events.length < pageSize) {
        hasMore = false
      } else {
        offset += pageSize
      }
    }

    // Filter for AI-generated workout events
    const aiEvents = allEvents.filter((e) => e.name?.includes('[AI]') && e.external_id)

    if (aiEvents.length === 0) {
      return Response.json({
        success: true,
        plans: [],
        count: 0,
      })
    }

    // Group events by plan ID (extracted from external_id: planId:sessionId)
    const planMap = new Map<string, IntervalsEvent[]>()
    for (const event of aiEvents) {
      if (!event.external_id) continue
      const [planId] = event.external_id.split(':')
      if (!planId) continue

      if (!planMap.has(planId)) {
        planMap.set(planId, [])
      }
      planMap.get(planId)!.push(event)
    }

    // Reconstruct plans from grouped events
    const reconstructedPlans: TrainingPlan[] = []

    for (const [planId, planEvents] of planMap.entries()) {
      // Sort events chronologically so firstDate is always the plan start.
      const sortedEvents = [...planEvents].sort((a, b) => {
        const dateA = a.start_date_local ? new Date(a.start_date_local).getTime() : Infinity
        const dateB = b.start_date_local ? new Date(b.start_date_local).getTime() : Infinity
        return dateA - dateB
      })
      const plan = reconstructPlanFromEvents(planId, sortedEvents)
      if (plan) {
        reconstructedPlans.push(plan)
      }
    }

    console.info('Fetched plans from Intervals.icu', {
      count: reconstructedPlans.length,
      eventCount: aiEvents.length,
    })

    return Response.json({
      success: true,
      plans: reconstructedPlans,
      count: reconstructedPlans.length,
    } satisfies PlansResponse)
  } catch (error) {
    console.error('Failed to fetch plans from Intervals.icu', { error })
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        plans: [],
      },
      { status: 200 }
    )
  }
}

function reconstructPlanFromEvents(planId: string, events: IntervalsEvent[]): TrainingPlan | null {
  if (events.length === 0) return null

  // Extract basic info from first event name: "[AI] Week X TYPE"
  const firstEvent = events[0]
  const firstDate = firstEvent.start_date_local ? new Date(firstEvent.start_date_local) : new Date()
  const planName = extractPlanName(firstEvent.name) || `Recovered Plan ${planId.slice(-6)}`

  // Reconstruct sessions from events
  const sessions: Map<number, TrainingSession[]> = new Map()

  for (const event of events) {
    if (!event.external_id) continue

    const [, sessionId] = event.external_id.split(':')
    if (!sessionId) continue

    const startDate = event.start_date_local ? new Date(event.start_date_local) : firstDate
    const weekMatch = event.name?.match(/Week\s+(\d+)/i)
    const inferredWeekFromDate = inferWeekNumberFromDate(firstDate, startDate)
    const weekNumber = weekMatch ? parseInt(weekMatch[1], 10) : inferredWeekFromDate

    if (!sessions.has(weekNumber)) {
      sessions.set(weekNumber, [])
    }

    const endDate = event.end_date_local ? new Date(event.end_date_local) : startDate
    const duration = event.moving_time ? Math.round(event.moving_time / 60) : 60

    const typeMatch = event.name?.match(/(ENDURANCE|TEMPO|THRESHOLD|VO2MAX|ANAEROBIC|STRENGTH|RECOVERY)/i)
    const sessionType = (typeMatch?.[1]?.toLowerCase() || 'endurance') as any

    const session: TrainingSession = {
      id: sessionId,
      date: startDate,
      dayOfWeek: startDate.getDay() || 7,
      type: sessionType,
      duration,
      intensity: sessionType === 'recovery' ? 'easy' : 'moderate',
      description: event.description || event.name || 'Workout',
      focus: [],
      equipment: [],
      structuredWorkout: event.description?.split('\n').filter((line) => line.trim()) || [],
    }

    sessions.get(weekNumber)!.push(session)
  }

  // Build weeks array
  const weeks: TrainingWeek[] = []
  for (let week = 1; week <= Math.max(...sessions.keys(), 12); week++) {
    const weekSessions = sessions.get(week) || []
    weeks.push({
      weekNumber: week,
      phase: week <= 4 ? 'base' : week <= 8 ? 'build' : week <= 10 ? 'peak' : 'recovery',
      focusPoints: extractFocusPoints(weekSessions),
      sessions: weekSessions,
      totalHours: weekSessions.reduce((sum, s) => sum + s.duration, 0) / 60,
    })
  }

  // Infer goal from sessions
  const goal = inferGoalFromSessions(weeks.flatMap((w) => w.sessions))

  const startDate = new Date(firstDate)
  const endDate = new Date(startDate.getTime() + weeks.length * 7 * 24 * 60 * 60 * 1000)

  return {
    id: planId,
    externalPlanId: planId,
    userId: 'imported',
    name: planName,
    goal,
    durationWeeks: weeks.length,
    startDate,
    endDate,
    weeks,
    mealSuggestions: [],
    targetMetrics: {},
    intervalsSync: {
      syncedAt: new Date().toISOString(),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function inferWeekNumberFromDate(planStartDate: Date, sessionDate: Date): number {
  const normalizedStart = new Date(planStartDate.getFullYear(), planStartDate.getMonth(), planStartDate.getDate(), 0, 0, 0, 0)
  const normalizedSession = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate(), 0, 0, 0, 0)
  const dayDiff = Math.floor((normalizedSession.getTime() - normalizedStart.getTime()) / (24 * 60 * 60 * 1000))

  if (dayDiff <= 0) {
    return 1
  }

  return Math.floor(dayDiff / 7) + 1
}

function extractPlanName(name?: string): string | null {
  if (!name) {
    return null
  }

  const match = name.match(/^\[AI\]\s+(.*?)\s+•\s+Week\s+\d+/)
  if (match?.[1]) {
    return match[1].trim()
  }

  return null
}

function extractFocusPoints(sessions: TrainingSession[]): string[] {
  const types = new Set(sessions.map((s) => s.type))
  const focus: string[] = []

  if (types.has('vo2max')) focus.push('VO2 Max Development')
  if (types.has('threshold')) focus.push('Lactate Threshold')
  if (types.has('anaerobic')) focus.push('Anaerobic Power')
  if (types.has('endurance')) focus.push('Aerobic Base')
  if (types.has('strength')) focus.push('Strength')

  return focus.length > 0 ? focus : ['General Fitness']
}

function inferGoalFromSessions(sessions: TrainingSession[]) {
  const vo2Count = sessions.filter((s) => s.type === 'vo2max').length
  const thresholdCount = sessions.filter((s) => s.type === 'threshold').length
  const enduranceCount = sessions.filter((s) => s.type === 'endurance').length

  if (thresholdCount > vo2Count && thresholdCount > enduranceCount) {
    return 'ftp_increase'
  }
  if (vo2Count > thresholdCount) {
    return 'ftp_increase'
  }
  if (enduranceCount > thresholdCount) {
    return 'endurance'
  }

  return 'ftp_increase'
}
