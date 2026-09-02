import { getIntervalsConfigFromRequest, hasIntervalsConfig, intervalsRequest } from '../_utils'

type EventsSyncRequest = {
  oldest: string
  newest: string
}

type IntervalsEvent = {
  category?: string
  name?: string
  start_date?: string
  start_date_local?: string
}

const NON_BLOCKING_CATEGORIES = new Set(['NOTE', 'PLAN'])

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as EventsSyncRequest
    const oldest = body?.oldest
    const newest = body?.newest

    if (!oldest || !newest) {
      return Response.json({ success: false, error: 'oldest and newest are required' }, { status: 400 })
    }

    const config = getIntervalsConfigFromRequest(request)
    if (!hasIntervalsConfig(config)) {
      return Response.json(
        {
          success: false,
          error: 'Intervals.icu credentials missing. Connect Intervals.icu and save API key + athlete ID.',
          blockedDates: [],
        },
        { status: 200 }
      )
    }

    const response = await intervalsRequest(
      `/api/v1/athlete/${config.athleteId}/events?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&limit=500`,
      {},
      config
    )

    const events = (await response.json()) as IntervalsEvent[]
    const eventCounts = new Map<string, number>()

    for (const event of events) {
      const category = (event.category || '').toUpperCase()
      if (!category || NON_BLOCKING_CATEGORIES.has(category)) {
        continue
      }

      const localDate = extractLocalDate(event.start_date_local || event.start_date)
      if (localDate) {
        eventCounts.set(localDate, (eventCounts.get(localDate) || 0) + 1)
      }
    }

    // Intervals.icu rejects the next event once a date already contains 20.
    // Return only saturated dates so normal overlap remains possible below the limit.
    const blockedDates = [...eventCounts.entries()]
      .filter(([, count]) => count >= 20)
      .map(([date]) => date)
      .sort()

    return Response.json({
      success: true,
      blockedDates: [...blockedDates].sort(),
    })
  } catch (error) {
    console.error('Failed to fetch Intervals events', { error })
    return Response.json(
      { success: false, error: 'Failed to fetch events from Intervals.icu', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
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