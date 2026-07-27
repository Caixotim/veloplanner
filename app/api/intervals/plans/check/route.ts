import { getIntervalsConfigFromRequest, hasIntervalsConfig, intervalsRequest } from '../../_utils'

type PlanSyncCheckRequest = {
  externalPlanId: string
}

type PlanSyncEventSnapshot = {
  date: string
  externalId: string
  sessionId: string | null
  name?: string
  description?: string
  movingTimeSeconds?: number
  workoutType?: string
  lastUpdatedAt?: string
}

type PlanSyncCheckResponse = {
  success: boolean
  existingDates: string[]
  matchCount: number
  events: PlanSyncEventSnapshot[]
  error?: string
}

type IntervalsEvent = {
  external_id?: string
  name?: string
  description?: string
  moving_time?: number
  type?: string
  start_date_local?: string
  start_date?: string
  updated?: string | number
  updated_at?: string | number
  modified?: string | number
  modified_at?: string | number
  modification_date?: string | number
  created?: string | number
  created_at?: string | number
}

/**
 * Returns plan event snapshots from Intervals.icu so the client can reconcile
 * deletions and resolve local-vs-remote conflicts by timestamp.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { externalPlanId } = (await request.json()) as PlanSyncCheckRequest

    if (!externalPlanId) {
      return Response.json(
        { success: false, error: 'externalPlanId is required', existingDates: [], matchCount: 0, events: [] },
        { status: 400 }
      )
    }

    const config = getIntervalsConfigFromRequest(request)
    if (!hasIntervalsConfig(config)) {
      return Response.json(
        {
          success: false,
          error: 'Intervals.icu credentials missing. Connect Intervals.icu and save API key + athlete ID.',
          existingDates: [],
          matchCount: 0,
          events: [],
        },
        { status: 200 }
      )
    }

    const response = await intervalsRequest(`/api/v1/athlete/${config.athleteId}/events?limit=500`, {}, config)
    const events = (await response.json()) as IntervalsEvent[]

    const prefix = `${externalPlanId}:`
    const matchingEvents = events.filter((event) => event.external_id?.startsWith(prefix))

    const snapshots = matchingEvents
      .map((event): PlanSyncEventSnapshot | null => {
        const date = extractLocalDate(event.start_date_local || event.start_date)
        if (!date || !event.external_id) {
          return null
        }

        const sessionIdParts = event.external_id.split(':')
        const sessionId = sessionIdParts.length > 1 ? sessionIdParts.slice(1).join(':') : null

        return {
          date,
          externalId: event.external_id,
          sessionId,
          name: event.name,
          description: event.description,
          movingTimeSeconds: typeof event.moving_time === 'number' ? event.moving_time : undefined,
          workoutType: event.type,
          lastUpdatedAt: resolveLastUpdatedAt(event),
        }
      })
      .filter((event): event is PlanSyncEventSnapshot => event !== null)

    const existingDates = [...new Set(snapshots.map((event) => event.date))]

    return Response.json({
      success: true,
      existingDates,
      matchCount: matchingEvents.length,
      events: snapshots,
    } satisfies PlanSyncCheckResponse)
  } catch (error) {
    console.error('Plan sync check failed', { error })
    return Response.json(
      {
        success: false,
        existingDates: [],
        matchCount: 0,
        events: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      } satisfies PlanSyncCheckResponse,
      { status: 200 }
    )
  }
}

function extractLocalDate(value?: string): string | null {
  if (!value) {
    return null
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function resolveLastUpdatedAt(event: IntervalsEvent): string | undefined {
  const candidates = [
    event.updated,
    event.updated_at,
    event.modified,
    event.modified_at,
    event.modification_date,
    event.created,
    event.created_at,
  ]

  for (const value of candidates) {
    const parsed = parseUnknownTimestamp(value)
    if (parsed) {
      return parsed
    }
  }

  return undefined
}

function parseUnknownTimestamp(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'number') {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
    return undefined
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const normalized = numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  const parsedDate = new Date(value)
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString()
  }

  return undefined
}
