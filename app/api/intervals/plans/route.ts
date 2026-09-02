import type { TrainingPlan, TrainingSession } from '@/app/lib/types'
import { getIntervalsConfigFromRequest, hasIntervalsConfig, intervalsRequest, toLocalIsoDate } from '../_utils'

export const maxDuration = 120

type PlanSyncMode = 'upsert' | 'replace' | 'delete'

type PlanSyncRequest = {
  mode: PlanSyncMode
  plan: TrainingPlan
}

type SyncedEvent = {
  id?: number
  external_id?: string
}

type PlanSyncResponse = {
  success: boolean
  externalPlanId?: string
  syncedEvents?: number
  attemptedSessions?: number
  failedSessions?: number
  failedSessionIds?: string[]
  syncedEventIds?: number[]
  deleted?: number
  error?: string
  details?: string
  subscriptionLimited?: boolean
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { mode, plan } = (await request.json()) as PlanSyncRequest

    if (!plan?.id) {
      return Response.json({ error: 'Plan payload is required' }, { status: 400 })
    }

    const config = getIntervalsConfigFromRequest(request)
    if (!hasIntervalsConfig(config)) {
      return Response.json(
        {
          success: false,
          error: 'Intervals.icu credentials missing. Connect Intervals.icu and save API key + athlete ID.',
        },
        { status: 200 }
      )
    }

    const externalPlanId = plan.externalPlanId || plan.id
    const sessions = flattenTrainableSessions(plan)

    if (mode === 'delete') {
      const deleted = await deletePlanEvents(config.athleteId, externalPlanId, sessions, config)
      return Response.json({ success: true, deleted } satisfies PlanSyncResponse)
    }

    if (mode === 'replace') {
      try {
        await deleteAllVeloPlannerEvents(config.athleteId, config)
      } catch (error) {
        console.warn('Unable to remove all stale VeloPlanner events before replacement', { error })
      }
      await deletePlanEvents(config.athleteId, externalPlanId, sessions, config)
    }

    const syncedEventIds: number[] = []
    const failedSessionIds: string[] = []
    const capacityFailedSessionIds = new Set<string>()
    // Intervals.icu applies a strict write rate limit. Limited concurrency avoids
    // a burst without making a full-plan sync exceed the route timeout.
    const BATCH_SIZE = 4
    const allSessions: Array<{ week: number; session: TrainingSession }> = []

    // Flatten all sessions across weeks
    for (const week of plan.weeks) {
      for (const session of week.sessions) {
        if (!isRestDay(session)) {
          allSessions.push({ week: week.weekNumber, session })
        }
      }
    }

    const saturatedDates = await findSaturatedEventDates(config.athleteId, allSessions, config)
    const sessionsToSync = allSessions.filter(({ session }) => !saturatedDates.has(toLocalIsoDate(toDate(session.date))))
    if (saturatedDates.size > 0) {
      console.warn('Skipping sessions on Intervals.icu saturated dates', { dates: [...saturatedDates], skipped: allSessions.length - sessionsToSync.length })
    }

    // Process sessions in batches to improve reliability on mobile connections
    for (let i = 0; i < sessionsToSync.length; i += BATCH_SIZE) {
      if (i > 0) {
        await wait(500)
      }
      const batch = sessionsToSync.slice(i, i + BATCH_SIZE)

      const promises = batch.map(async ({ week, session }) => {
        try {
          const created = await upsertIntervalsSession(config, plan, externalPlanId, week, session)
          return {
            sessionId: session.id,
            eventId: created.id || null,
          }
        } catch (error) {
          if (isIntervalsCapacityError(error)) {
            capacityFailedSessionIds.add(session.id)
            console.warn('Skipping session because Intervals.icu date is full', { sessionId: session.id, date: toLocalIsoDate(toDate(session.date)) })
          } else {
            console.warn(`Failed to sync session in batch: ${session.id}`, { error })
          }
          return {
            sessionId: session.id,
            eventId: null,
          }
        }
      })

      const results = await Promise.allSettled(promises)
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.eventId) {
            syncedEventIds.push(result.value.eventId)
          } else {
            failedSessionIds.push(result.value.sessionId)
          }
        }
      }
    }

    // Retry failed sessions one-by-one to recover from transient API/network issues.
    if (failedSessionIds.length > 0) {
      const failedSet = new Set(failedSessionIds)
      const retrySessions = sessionsToSync.filter(({ session }) => failedSet.has(session.id) && !capacityFailedSessionIds.has(session.id))
      failedSessionIds.length = 0

      for (const { week, session } of retrySessions) {
        await wait(1_000)
        try {
          const created = await upsertIntervalsSession(config, plan, externalPlanId, week, session, { minimalPayload: true })
          if (created.id) {
            syncedEventIds.push(created.id)
          } else {
            failedSessionIds.push(session.id)
          }
        } catch (retryError) {
          if (isIntervalsCapacityError(retryError)) {
            capacityFailedSessionIds.add(session.id)
            console.warn('Skipping retry because Intervals.icu date is full', { sessionId: session.id, date: toLocalIsoDate(toDate(session.date)) })
          } else {
            console.warn(`Retry failed for session: ${session.id}`, { retryError })
          }
          failedSessionIds.push(session.id)
        }
      }

      for (const sessionId of capacityFailedSessionIds) {
        if (!failedSessionIds.includes(sessionId)) {
          failedSessionIds.push(sessionId)
        }
      }
    }

    console.info('Intervals plan sync completed', {
      planId: plan.id,
      mode,
      sessionsSynced: syncedEventIds.length,
      sessionsAttempted: allSessions.length,
      sessionsFailed: failedSessionIds.length,
    })

    if (failedSessionIds.length > 0) {
      return Response.json({
        success: false,
        externalPlanId,
        syncedEvents: syncedEventIds.length,
        attemptedSessions: allSessions.length,
        failedSessions: failedSessionIds.length,
        failedSessionIds,
        syncedEventIds,
        error: 'Partial plan sync',
        details: `Synced ${syncedEventIds.length}/${allSessions.length} sessions. ${failedSessionIds.length} sessions failed (${failedSessionIds.join(', ')}).`,
      } satisfies PlanSyncResponse)
    }

    return Response.json({
      success: true,
      externalPlanId,
      syncedEvents: syncedEventIds.length,
      attemptedSessions: allSessions.length,
      failedSessions: 0,
      failedSessionIds: [],
      syncedEventIds,
    } satisfies PlanSyncResponse)
  } catch (error) {
    if (isIntervalsSubscriptionError(error)) {
      return Response.json(
        {
          success: false,
          subscriptionLimited: true,
          error: 'Intervals.icu plan push requires a paid account tier for event write access.',
          details: error instanceof Error ? error.message : 'Unknown error',
        } satisfies PlanSyncResponse,
        { status: 200 }
      )
    }

    console.error('Intervals plan sync failed', { error })
    return Response.json(
      { error: 'Failed to sync plan to Intervals.icu', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

async function bulkDeleteByExternalIds(athleteId: string, externalIds: string[], config: { apiKey: string; athleteId: string; baseUrl: string }): Promise<number> {
  if (externalIds.length === 0) {
    return 0
  }

  await intervalsRequest(`/api/v1/athlete/${athleteId}/events/bulk-delete`, {
    method: 'PUT',
    body: JSON.stringify(externalIds.map((external_id) => ({ external_id }))),
  }, config)

  return externalIds.length
}

async function deletePlanEvents(
  athleteId: string,
  externalPlanId: string,
  sessions: TrainingSession[],
  config: { apiKey: string; athleteId: string; baseUrl: string }
): Promise<number> {
  const matchingIds = new Set(sessions.map((session) => buildExternalEventId(externalPlanId, session.id)))

  try {
    const prefixedIds = await listPlanEventExternalIds(athleteId, externalPlanId, config)
    for (const externalId of prefixedIds) {
      matchingIds.add(externalId)
    }
  } catch (error) {
    console.warn('Falling back to local plan event deletion only', { externalPlanId, error })
  }

  return bulkDeleteByExternalIds(athleteId, [...matchingIds], config)
}

async function deleteAllVeloPlannerEvents(
  athleteId: string,
  config: { apiKey: string; athleteId: string; baseUrl: string }
): Promise<number> {
  const externalIds: string[] = []
  for (let page = 0; page < 20; page++) {
    const response = await intervalsRequest(`/api/v1/athlete/${athleteId}/events?limit=500&offset=${page * 500}`, {}, config)
    const events = (await response.json()) as Array<{ external_id?: string; name?: string }>
    externalIds.push(...events
      .filter((event) => event.external_id && (event.name?.includes('[AI]') || event.external_id.startsWith('plan_')))
      .map((event) => event.external_id as string))
    if (events.length < 500) break
  }

  let deleted = 0
  for (let index = 0; index < externalIds.length; index += 100) {
    deleted += await bulkDeleteByExternalIds(athleteId, externalIds.slice(index, index + 100), config)
  }
  if (deleted > 0) {
    console.info('Removed stale VeloPlanner events before schedule replacement', { deleted })
  }
  return deleted
}

async function findSaturatedEventDates(
  athleteId: string,
  sessions: Array<{ session: TrainingSession }>,
  config: { apiKey: string; athleteId: string; baseUrl: string }
): Promise<Set<string>> {
  try {
    const wantedDates = new Set(sessions.map(({ session }) => toLocalIsoDate(toDate(session.date))))
    const counts = new Map<string, number>()
    for (let page = 0; page < 20; page++) {
      const response = await intervalsRequest(`/api/v1/athlete/${athleteId}/events?limit=500&offset=${page * 500}`, {}, config)
      const events = (await response.json()) as Array<{ start_date_local?: string; start_date?: string }>
      for (const event of events) {
        const date = (event.start_date_local || event.start_date || '').slice(0, 10)
        if (wantedDates.has(date)) counts.set(date, (counts.get(date) || 0) + 1)
      }
      if (events.length < 500) break
    }
    return new Set([...counts.entries()].filter(([, count]) => count >= 20).map(([date]) => date))
  } catch (error) {
    console.warn('Unable to inspect Intervals.icu event capacity before sync', { error })
    return new Set()
  }
}

async function listPlanEventExternalIds(
  athleteId: string,
  externalPlanId: string,
  config: { apiKey: string; athleteId: string; baseUrl: string }
): Promise<string[]> {
  const prefix = `${externalPlanId}:`
  const matches = new Set<string>()
  const pageSize = 500
  const maxPages = 20

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize
    const response = await intervalsRequest(`/api/v1/athlete/${athleteId}/events?limit=${pageSize}&offset=${offset}`, {}, config)
    const events = (await response.json()) as Array<{ external_id?: string }>

    for (const event of events) {
      if (event.external_id?.startsWith(prefix)) {
        matches.add(event.external_id)
      }
    }

    if (events.length < pageSize) {
      break
    }

  }

  return [...matches]
}

function buildExternalEventId(externalPlanId: string, sessionId: string): string {
  return `${externalPlanId}:${sessionId}`
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isIntervalsCapacityError(error: unknown): boolean {
  return error instanceof Error && /Too many events.*max is 20/i.test(error.message)
}

async function upsertIntervalsSession(
  config: { apiKey: string; athleteId: string; baseUrl: string },
  plan: TrainingPlan,
  externalPlanId: string,
  week: number,
  session: TrainingSession,
  options: { minimalPayload?: boolean } = {}
): Promise<SyncedEvent> {
  const payload = buildIntervalsEventPayload(plan, externalPlanId, week, session, options)
  await ensureDailyEventCapacity(config, session, payload.external_id as string)
  const response = await intervalsRequest(
    `/api/v1/athlete/${config.athleteId}/events?upsertOnUid=true`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    config
  )

  return (await response.json()) as SyncedEvent
}

const MAX_EVENTS_PER_DAY = 5

async function ensureDailyEventCapacity(
  config: { apiKey: string; athleteId: string; baseUrl: string },
  session: TrainingSession,
  currentExternalId: string
): Promise<void> {
  const date = toLocalIsoDate(toDate(session.date))
  const response = await intervalsRequest(
    `/api/v1/athlete/${config.athleteId}/events?oldest=${date}&newest=${date}&limit=500`,
    {},
    config
  )
  const events = (await response.json()) as IntervalsEventForCapacity[]
  const sameDayEvents = events.filter((event) => (event.start_date_local || event.start_date || '').startsWith(date))
  const existingCurrentEvent = sameDayEvents.some((event) => event.external_id === currentExternalId || event.uid === currentExternalId)
  const requiredRemovals = Math.max(0, sameDayEvents.length + (existingCurrentEvent ? 0 : 1) - MAX_EVENTS_PER_DAY)
  if (requiredRemovals === 0) return

  const removable = sameDayEvents
    .filter((event) => event.external_id && event.external_id !== currentExternalId && (event.name?.includes('[AI]') || event.external_id.startsWith('plan_')))
    .sort((left, right) => eventCreatedTimestamp(left) - eventCreatedTimestamp(right))
    .slice(0, requiredRemovals)

  if (removable.length < requiredRemovals) {
    throw new Error(`Intervals.icu date ${date} already has ${sameDayEvents.length} events; cannot keep the app limit of ${MAX_EVENTS_PER_DAY} without deleting non-VeloPlanner events.`)
  }

  await bulkDeleteByExternalIds(config.athleteId, removable.map((event) => event.external_id as string), config)
  console.info('Purged oldest VeloPlanner sessions to keep daily event limit', { date, deleted: removable.length })
}

type IntervalsEventForCapacity = {
  id?: number
  uid?: string
  external_id?: string
  name?: string
  start_date?: string
  start_date_local?: string
  created?: string
  created_at?: string
}

function eventCreatedTimestamp(event: IntervalsEventForCapacity): number {
  const created = Date.parse(event.created_at || event.created || '')
  return Number.isNaN(created) ? event.id || Number.MAX_SAFE_INTEGER : created
}

function buildIntervalsEventPayload(
  plan: TrainingPlan,
  externalPlanId: string,
  week: number,
  session: TrainingSession,
  options: { minimalPayload?: boolean } = {}
): Record<string, unknown> {
  const startDate = toDate(session.date)
  const endDate = new Date(startDate.getTime() + session.duration * 60 * 1000)
  const workoutType = getIntervalsWorkoutType(session)
  const isMinimalPayload = options.minimalPayload === true
  const structuredFile = !isMinimalPayload && shouldAttachCyclingFile(workoutType)
    ? buildStructuredWorkoutFile(plan, week, session)
    : null

  return {
    category: 'WORKOUT',
    type: workoutType,
    name: `[AI] ${plan.name} • Week ${week} ${session.type.toUpperCase()}`,
    description: isMinimalPayload ? buildMinimalWorkoutDescription(session, workoutType) : buildWorkoutDescription(session, workoutType),
    ...(structuredFile
      ? {
          file_contents: structuredFile.contents,
          filename: structuredFile.filename,
        }
      : {}),
    start_date_local: toLocalDateTime(startDate),
    end_date_local: toLocalDateTime(endDate),
    start_date: toLocalIsoDate(startDate),
    end_date: toLocalIsoDate(endDate),
    uid: buildExternalEventId(externalPlanId, session.id),
    external_id: buildExternalEventId(externalPlanId, session.id),
    moving_time: Math.max(0, session.duration * 60),
  }
}

function flattenTrainableSessions(plan: TrainingPlan): TrainingSession[] {
  return plan.weeks.flatMap((week) => week.sessions).filter((session) => !isRestDay(session))
}

function isRestDay(session: TrainingSession): boolean {
  return session.type === 'recovery' && session.duration === 0
}

function buildWorkoutDescription(session: TrainingSession, workoutType: string): string {
  if (workoutType === 'WeightTraining') {
    return buildStrengthWorkoutDescription(session)
  }

  if (workoutType === 'Rowing' || workoutType === 'VirtualRow') {
    return buildRowingWorkoutDescription(session)
  }

  const structured = session.structuredWorkout?.length ? session.structuredWorkout.join('\n') : session.description
  const notes = session.notes ? `\n\nNotes:\n${session.notes}` : ''
  return `${session.description}\n\n${structured}${notes}`
}

function buildMinimalWorkoutDescription(session: TrainingSession, workoutType: string): string {
  if (workoutType === 'WeightTraining') {
    return `Strength Session (${session.duration} min)`
  }

  if (workoutType === 'Rowing' || workoutType === 'VirtualRow') {
    return `Rowing Session (${session.duration} min)`
  }

  return session.description
}

function getIntervalsWorkoutType(session: TrainingSession): string {
  if (session.type === 'strength') {
    return 'WeightTraining'
  }

  if (session.equipment.includes('rowing_machine')) {
    return 'VirtualRow'
  }

  return 'Ride'
}

function shouldAttachCyclingFile(workoutType: string): boolean {
  return workoutType === 'Ride' || workoutType === 'VirtualRide' || workoutType === 'GravelRide' || workoutType === 'TrackRide'
}

function buildStrengthWorkoutDescription(session: TrainingSession): string {
  const steps = session.structuredWorkout?.length
    ? session.structuredWorkout
    : [
        `Warm-up 8-10 min mobility and activation`,
        `Main set 30-40 min strength circuits (lower body, core, upper pull/push)`,
        `Cool-down 5-10 min mobility`,
      ]

  return [
    `Strength Session (${session.duration} min)`,
    'Focus on movement quality, controlled tempo, and progressive overload.',
    '',
    ...steps,
    session.notes ? `\nNotes:\n${session.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildRowingWorkoutDescription(session: TrainingSession): string {
  const warmup = `Warm-up 8-10 min easy row @ RPE 2-3`
  const cooldown = `Cool-down 5-8 min easy row + mobility`
  const duration = Math.max(20, session.duration)

  const blockByType: Record<TrainingSession['type'], string[]> = {
    recovery: [`Main ${Math.max(12, duration - 18)} min steady @ RPE 2-3, smooth stroke rate 18-22 spm`],
    endurance: [`Main ${Math.max(20, duration - 18)} min aerobic @ RPE 3-4, cadence 20-24 spm`],
    tempo: ['3x8 min @ RPE 5-6 with 3 min easy row between reps'],
    threshold: ['4x6 min @ RPE 7 with 3 min easy row between reps'],
    vo2max: ['6x3 min @ RPE 8-9 with 3 min easy row between reps'],
    anaerobic: ['10x1 min hard @ RPE 9 with 2 min easy row between reps'],
    strength: ['6x2 min low-rate power strokes @ RPE 7-8 with 2 min easy row between reps'],
  }

  const steps = session.structuredWorkout?.length
    ? session.structuredWorkout.map((step) => step.replace(/\([^)]*FTP[^)]*\)/gi, '').replace(/\d+\s*-\s*\d+W/gi, 'RPE guided effort'))
    : blockByType[session.type]

  return [
    `Rowing Session (${session.duration} min)`,
    'Target using RPE and stroke quality (not cycling power zones).',
    '',
    warmup,
    ...steps,
    cooldown,
    session.notes ? `\nNotes:\n${session.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function toDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid session date provided: ${String(value)}`)
  }

  return parsed
}

function isIntervalsSubscriptionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /Intervals API failed \((402|403)\)/.test(error.message)
}

type StructuredWorkoutFile = {
  filename: string
  contents: string
}

function buildStructuredWorkoutFile(plan: TrainingPlan, weekNumber: number, session: TrainingSession): StructuredWorkoutFile {
  const slug = `${plan.name}-w${weekNumber}-d${session.dayOfWeek}-${session.type}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const filename = `${slug || `w${weekNumber}-d${session.dayOfWeek}-${session.type}`}.zwo`

  const descriptionSteps = session.structuredWorkout?.length
    ? session.structuredWorkout
    : [session.description]

  const blocks = buildZwiftBlocks(session.type, session.duration)
  const workoutLines = blocks.map((block) => {
    if (block.kind === 'warmup') {
      return `      <Warmup Duration="${block.durationSec}" PowerLow="${block.powerLow}" PowerHigh="${block.powerHigh}"/>`
    }

    if (block.kind === 'cooldown') {
      return `      <Cooldown Duration="${block.durationSec}" PowerLow="${block.powerLow}" PowerHigh="${block.powerHigh}"/>`
    }

    if (block.kind === 'steady') {
      return `      <SteadyState Duration="${block.durationSec}" Power="${block.power}"/>`
    }

    return `      <IntervalsT Repeat="${block.repeat}" OnDuration="${block.onDurationSec}" OffDuration="${block.offDurationSec}" OnPower="${block.onPower}" OffPower="${block.offPower}"/>`
  })

  const contents = [
    '<workout_file>',
    '  <author>CyclingAI</author>',
    `  <name>W${weekNumber} ${session.type.toUpperCase()} ${session.duration}min</name>`,
    `  <description>${escapeXml(descriptionSteps.join(' | '))}</description>`,
    '  <tags>',
    `    <tag name="goal" value="${escapeXml(plan.goal)}"/>`,
    `    <tag name="week" value="${weekNumber}"/>`,
    `    <tag name="session_type" value="${escapeXml(session.type)}"/>`,
    '  </tags>',
    '  <workout>',
    ...workoutLines,
    '  </workout>',
    '</workout_file>',
  ].join('\n')

  return { filename, contents }
}

type ZwiftBlock =
  | { kind: 'warmup'; durationSec: number; powerLow: number; powerHigh: number }
  | { kind: 'cooldown'; durationSec: number; powerLow: number; powerHigh: number }
  | { kind: 'steady'; durationSec: number; power: number }
  | {
      kind: 'intervals'
      repeat: number
      onDurationSec: number
      offDurationSec: number
      onPower: number
      offPower: number
    }

function buildZwiftBlocks(type: TrainingSession['type'], durationMin: number): ZwiftBlock[] {
  const totalSec = Math.max(20 * 60, durationMin * 60)
  const warmupSec = Math.min(10 * 60, Math.floor(totalSec * 0.2))
  const cooldownSec = Math.min(10 * 60, Math.floor(totalSec * 0.2))
  const mainSec = Math.max(5 * 60, totalSec - warmupSec - cooldownSec)

  if (type === 'vo2max') {
    const repeat = Math.max(3, Math.floor(mainSec / (3 * 60 + 3 * 60)))
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.7 },
      { kind: 'intervals', repeat, onDurationSec: 3 * 60, offDurationSec: 3 * 60, onPower: 1.15, offPower: 0.55 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'threshold') {
    const repeat = Math.max(2, Math.floor(mainSec / (10 * 60 + 4 * 60)))
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.72 },
      { kind: 'intervals', repeat, onDurationSec: 10 * 60, offDurationSec: 4 * 60, onPower: 1.0, offPower: 0.6 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'anaerobic') {
    const repeat = Math.max(4, Math.floor(mainSec / (60 + 120)))
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.72 },
      { kind: 'intervals', repeat, onDurationSec: 60, offDurationSec: 120, onPower: 1.3, offPower: 0.5 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'tempo') {
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.68 },
      { kind: 'steady', durationSec: mainSec, power: 0.82 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.58, powerHigh: 0.42 },
    ]
  }

  if (type === 'endurance') {
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.48, powerHigh: 0.62 },
      { kind: 'steady', durationSec: mainSec, power: 0.67 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.55, powerHigh: 0.4 },
    ]
  }

  if (type === 'strength') {
    const repeat = Math.max(3, Math.floor(mainSec / (5 * 60 + 3 * 60)))
    return [
      { kind: 'warmup', durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.7 },
      { kind: 'intervals', repeat, onDurationSec: 5 * 60, offDurationSec: 3 * 60, onPower: 0.92, offPower: 0.52 },
      { kind: 'cooldown', durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  return [
    { kind: 'warmup', durationSec: Math.min(5 * 60, warmupSec), powerLow: 0.45, powerHigh: 0.55 },
    { kind: 'steady', durationSec: Math.max(10 * 60, mainSec), power: 0.55 },
    { kind: 'cooldown', durationSec: Math.min(5 * 60, cooldownSec), powerLow: 0.5, powerHigh: 0.4 },
  ]
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toLocalDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}
