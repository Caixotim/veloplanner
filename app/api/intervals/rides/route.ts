import { getIntervalsConfigFromRequest, getTimezoneFromRequest, hasIntervalsConfig, intervalsRequest, toLocalIsoDate } from '../_utils'
import { getAuthenticatedIntervalsConfig } from '../serverConfig'
import { filterStableActivities, getRideCursor } from '../../../lib/rideSync'


type SyncRequest = {
  since: number
  forceRefresh?: boolean
}

type IntervalsZoneTime = {
  id?: string
  secs?: number
}

type IntervalsActivity = {
  id?: number | string
  start_date_local?: string
  ss_p_max?: number
  p_max?: number
  icu_pm_p_max?: number
  icu_rolling_p_max?: number
  icu_weighted_avg_watts?: number
  icu_average_watts?: number
  icu_pm_ftp_watts?: number
  icu_training_load?: number
  icu_intensity?: number
  trimp?: number
  icu_zone_times?: IntervalsZoneTime[]
  icu_hr_zone_times?: number[]
  max_heartrate?: number
  average_heartrate?: number
  moving_time?: number
  distance?: number
  total_elevation_gain?: number
  elevation_gain?: number
  elev_gain?: number
  icu_elevation_gain?: number
  icu_best_15s_watts?: number
  icu_best_1m_watts?: number
  icu_best_5m_watts?: number
  icu_best_20m_watts?: number
  icu_best_60m_watts?: number
  best_efforts?: Record<string, number>
  icu_best_efforts?: Record<string, number>
  icu_bests?: Record<string, number>
}

function readNumberField(source: unknown, keys: string[]): number | undefined {
  if (!source || typeof source !== 'object') {
    return undefined
  }

  const sourceRecord = source as Record<string, unknown>
  for (const key of keys) {
    const candidate = sourceRecord[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
  }

  return undefined
}

function readBestEffortPower(activity: IntervalsActivity, aliases: string[]): number | undefined {
  const topLevel = readNumberField(activity, aliases)
  if (topLevel) {
    return Math.round(topLevel)
  }

  const nestedContainers: unknown[] = [
    activity.best_efforts,
    activity.icu_best_efforts,
    activity.icu_bests,
    (activity as Record<string, unknown>).power_bests,
    (activity as Record<string, unknown>).icu_power_bests,
  ]

  for (const container of nestedContainers) {
    const nested = readNumberField(container, aliases)
    if (nested) {
      return Math.round(nested)
    }
  }

  return undefined
}

function extractBestEfforts(activity: IntervalsActivity): {
  bestEffort15s?: number
  bestEffort1m?: number
  bestEffort5m?: number
  bestEffort20m?: number
  bestEffort60m?: number
} {
  return {
    bestEffort15s: readBestEffortPower(activity, ['icu_best_15s_watts', 'best_15s_watts', '15s', 'p15s']),
    bestEffort1m: readBestEffortPower(activity, ['icu_best_1m_watts', 'best_1m_watts', '1m', 'p1m']),
    bestEffort5m: readBestEffortPower(activity, ['icu_best_5m_watts', 'best_5m_watts', '5m', 'p5m']),
    bestEffort20m: readBestEffortPower(activity, ['icu_best_20m_watts', 'best_20m_watts', '20m', 'p20m']),
    bestEffort60m: readBestEffortPower(activity, ['icu_best_60m_watts', 'best_60m_watts', '60m', 'p60m']),
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json()
    if (!isSyncRequest(body)) {
      return Response.json({ error: 'Invalid rides sync request' }, { status: 400 })
    }

    const since = body.since ?? 0
    const forceRefresh = body.forceRefresh === true
    const timeZone = getTimezoneFromRequest(request)

    const config = (await getAuthenticatedIntervalsConfig()) ?? getIntervalsConfigFromRequest(request)
    if (!hasIntervalsConfig(config)) {
      return Response.json(
        {
          success: false,
          error: 'Intervals.icu credentials missing. Connect Intervals.icu and save API key + athlete ID.',
          newRidesCount: 0,
          rides: [],
          changes: [],
        },
        { status: 200 }
      )
    }

    // Determine lookback window:
    // - forceRefresh or since=0: always 90 days (fresh sync)
    // - otherwise: use since timestamp (delta sync with 2-day buffer)
    let oldestMs: number
    if (forceRefresh || since === 0) {
      oldestMs = Date.now() - 90 * 24 * 60 * 60 * 1000
    } else {
      oldestMs = since
    }

    const oldest = toLocalIsoDate(oldestMs, timeZone)
    const newest = toLocalIsoDate(Date.now(), timeZone)

    const response = await intervalsRequest(
      `/api/v1/athlete/${config.athleteId}/activities?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&limit=100`,
      {},
      config
    )

    const activities = (await response.json()) as IntervalsActivity[]
    const rides = filterStableActivities(activities)
      .map((activity) => {
      const bestEfforts = extractBestEfforts(activity)
      const peakPower = Math.round(activity.icu_pm_p_max || activity.icu_rolling_p_max || activity.p_max || 0)
      const normalizedPower = Math.round(activity.icu_weighted_avg_watts || 0)
      const averagePower = Math.round(activity.icu_average_watts || 0)
      const ftpWatts = Math.round(activity.icu_pm_ftp_watts || 0)
      const elevationGainM = Math.round(
        activity.icu_elevation_gain || activity.total_elevation_gain || activity.elevation_gain || activity.elev_gain || 0
      )
      const powerZoneTimes = (activity.icu_zone_times || []).reduce<Record<string, number>>((acc, zone) => {
        const key = (zone.id || '').toUpperCase()
        const secs = Math.round(zone.secs || 0)
        if (key && secs > 0) {
          acc[key] = secs
        }
        return acc
      }, {})
      const hrZoneTimes = (activity.icu_hr_zone_times || []).map((seconds) => Math.round(seconds || 0))
      const powerZoneTotalSecs = Object.values(powerZoneTimes).reduce((sum, secs) => sum + secs, 0)
      const easyPowerZoneSecs = (powerZoneTimes.Z1 || 0) + (powerZoneTimes.Z2 || 0)
      const highPowerZoneSecs = (powerZoneTimes.Z4 || 0) + (powerZoneTimes.Z5 || 0) + (powerZoneTimes.Z6 || 0) + (powerZoneTimes.Z7 || 0)
      const sweetSpotZoneSecs = powerZoneTimes.SS || 0

      return {
        id: String(activity.id),
        date: activity.start_date_local ? new Date(activity.start_date_local).getTime() : Date.now(),
        maxPower: peakPower,
        peakPower,
        normalizedPower,
        averagePower,
        ...bestEfforts,
        ftpWatts,
        trainingLoad: Math.round(activity.icu_training_load || 0),
        intensity: Math.round(activity.icu_intensity || 0),
        trimp: Math.round(activity.trimp || 0),
        powerZoneTimes,
        hrZoneTimes,
        powerZoneTotalSecs,
        easyPowerZoneSecs,
        highPowerZoneSecs,
        sweetSpotZoneSecs,
        elevationGainM,
        avgHR: Math.round(activity.average_heartrate || 0),
        duration: Math.round((activity.moving_time || 0) / 60),
        distance: Math.round((activity.distance || 0) / 100) / 10,
        maxHR: Math.round(activity.max_heartrate || 0),
      }
      })

    console.info('Intervals rides synced', { count: rides.length, oldest, newest })

    return Response.json({
      success: true,
      newRidesCount: rides.length,
      rides,
      ...(rides.length > 0 ? { nextCursor: getRideCursor(rides.map((ride) => ride.date), Date.now()) } : {}),
      changes:
        rides.length > 0
          ? [
              {
                type: 'new_rides',
                label: `${rides.length} new ride(s) detected from Intervals.icu`,
              },
            ]
          : [],
    })
  } catch (error) {
    console.error('Intervals rides sync failed', { error })
    return Response.json(
      { error: 'Failed to sync rides from Intervals.icu', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

export function isSyncRequest(value: unknown): value is SyncRequest {
  if (!value || typeof value !== 'object') return false
  const body = value as { since?: unknown; forceRefresh?: unknown }
  return (
    (body.since === undefined || (typeof body.since === 'number' && Number.isFinite(body.since) && body.since >= 0)) &&
    (body.forceRefresh === undefined || typeof body.forceRefresh === 'boolean')
  )
}
