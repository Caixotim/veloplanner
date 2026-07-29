import type { AthleteRideSignature, IntervalsTrainingInsights } from './intervalsIntegration'
import type { EventPriority, UserProfile, TrainingPlan, TrainingWeek, TrainingSession, SessionType, TrainingPhase, Equipment } from './types'

export type PlanRequest = {
  name: string
  goal: UserProfile['goal']
  durationWeeks: number
  startDate: Date
  ftpIncreaseTargetWatts?: number
  plannedEvents?: UserProfile['plannedEvents']
}

export type AthletePlanContext = Pick<
  UserProfile,
  | 'availableTime'
  | 'equipment'
  | 'hasPowerMeter'
  | 'ftp'
  | 'maxHeartRate'
  | 'weight'
  | 'injuries'
  | 'intensityDistribution'
  | 'qualityPriority'
  | 'hardSessionsPerWeekCap'
  | 'shortDayPreference'
  | 'plannedEvents'
>

type PlanGenerationContext = {
  intervalsInsights?: IntervalsTrainingInsights
  blockedDates?: string[]
}

type SessionTemplate = {
  type: SessionType
  day: number
  duration: number
}

/**
 * Generate a structured training plan based on user profile
 */
export function generateTrainingPlan(
  userId: string,
  planRequest: PlanRequest,
  athleteContext: AthletePlanContext,
  context?: PlanGenerationContext
): TrainingPlan {
  const generatedPlanId = `plan_${userId}_${Date.now()}`
  const startDate = normalizePlanStartDate(planRequest.startDate)
  const endDate = new Date(startDate.getTime() + planRequest.durationWeeks * 7 * 24 * 60 * 60 * 1000)
  const resolvedPlanRequest: PlanRequest = {
    ...planRequest,
    ftpIncreaseTargetWatts:
      planRequest.ftpIncreaseTargetWatts !== undefined && planRequest.ftpIncreaseTargetWatts > 0
        ? planRequest.ftpIncreaseTargetWatts
        :
      assessFtpIncreaseTarget({
        ftp: athleteContext.ftp,
        durationWeeks: planRequest.durationWeeks,
        availableTime: athleteContext.availableTime,
        injuries: athleteContext.injuries,
        insights: context?.intervalsInsights,
      }),
  }
  const planningProfile = buildPlanningProfile(resolvedPlanRequest, athleteContext)
  const blockedDates = new Set(context?.blockedDates || [])

  const weeks: TrainingWeek[] = []

  for (let weekNumber = 1; weekNumber <= planRequest.durationWeeks; weekNumber++) {
    const phase = determinePhase(weekNumber, planRequest.durationWeeks)
    const focusPoints = determineFocusPoints(weekNumber, planRequest.durationWeeks, planRequest.goal)
    const previousWeek = weeks[weeks.length - 1]
    const previousWeekLoadScore = previousWeek ? calculateWeekLoadScore(previousWeek.sessions) : undefined
    const sessions = generateWeekSessions(
      weekNumber,
      phase,
      planningProfile,
      focusPoints,
      planRequest.durationWeeks,
      startDate,
      blockedDates,
      previousWeekLoadScore,
      context
    )

    weeks.push({
      weekNumber,
      phase,
      focusPoints,
      sessions,
      totalHours: sessions.reduce((sum, s) => sum + s.duration / 60, 0),
    })
  }

  console.info('Generated training plan', { userId, durationWeeks: planRequest.durationWeeks, weeks: weeks.length, startDate })

  return {
    id: generatedPlanId,
    externalPlanId: generatedPlanId,
    userId,
    name: planRequest.name,
    goal: planRequest.goal,
    durationWeeks: planRequest.durationWeeks,
    startDate,
    endDate,
    weeks,
    mealSuggestions: [],
    targetMetrics: calculateTargetMetrics(planningProfile, resolvedPlanRequest.durationWeeks),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export function buildPlanRequest(profile: Pick<UserProfile, 'planName' | 'goal' | 'desiredPlanWeeks' | 'ftpIncreaseTargetWatts' | 'planStartDate' | 'plannedEvents'>): PlanRequest {
  return {
    name: profile.planName || buildDefaultPlanName(profile.goal, parsePlanStartDate(profile.planStartDate)),
    goal: profile.goal,
    durationWeeks: profile.desiredPlanWeeks || 12,
    startDate: parsePlanStartDate(profile.planStartDate),
    ftpIncreaseTargetWatts: profile.ftpIncreaseTargetWatts,
    plannedEvents: profile.plannedEvents || [],
  }
}

export function buildAthletePlanContext(
  profile: Pick<
    UserProfile,
    | 'availableTime'
    | 'equipment'
    | 'hasPowerMeter'
    | 'ftp'
    | 'maxHeartRate'
    | 'weight'
    | 'injuries'
    | 'intensityDistribution'
    | 'qualityPriority'
    | 'hardSessionsPerWeekCap'
    | 'shortDayPreference'
    | 'plannedEvents'
  >
): AthletePlanContext {
  return {
    availableTime: profile.availableTime,
    equipment: profile.equipment,
    hasPowerMeter: profile.hasPowerMeter,
    ftp: profile.ftp,
    maxHeartRate: profile.maxHeartRate,
    weight: profile.weight,
    injuries: profile.injuries,
    intensityDistribution: profile.intensityDistribution,
    qualityPriority: profile.qualityPriority,
    hardSessionsPerWeekCap: profile.hardSessionsPerWeekCap,
    shortDayPreference: profile.shortDayPreference,
    plannedEvents: profile.plannedEvents || [],
  }
}

export function parsePlanStartDate(value?: string): Date {
  if (value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
      const [, year, month, day] = match
      return normalizePlanStartDate(new Date(Number(year), Number(month) - 1, Number(day), 6, 0, 0, 0))
    }
  }

  return normalizePlanStartDate(new Date())
}

export function normalizePlanStartDate(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 6, 0, 0, 0)
  return normalized
}

function buildPlanningProfile(planRequest: PlanRequest, athleteContext: AthletePlanContext): UserProfile {
  const now = new Date()

  return {
    id: 'planning-profile',
    planName: planRequest.name,
    age: 0,
    height: 0,
    weight: athleteContext.weight,
    goal: planRequest.goal,
    intensityDistribution: athleteContext.intensityDistribution || 'conservative',
    qualityPriority: athleteContext.qualityPriority || 'balanced',
    hardSessionsPerWeekCap: athleteContext.hardSessionsPerWeekCap || 2,
    shortDayPreference: athleteContext.shortDayPreference || 'mixed',
    planStartDate: formatPlanStartDate(planRequest.startDate),
    desiredPlanWeeks: planRequest.durationWeeks,
    ftpIncreaseTargetWatts: planRequest.ftpIncreaseTargetWatts,
    plannedEvents: planRequest.plannedEvents || athleteContext.plannedEvents || [],
    injuries: athleteContext.injuries,
    equipment: athleteContext.equipment,
    hasPowerMeter: athleteContext.hasPowerMeter,
    availableTime: athleteContext.availableTime,
    ftp: athleteContext.ftp,
    maxHeartRate: athleteContext.maxHeartRate,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildDefaultPlanName(goal: UserProfile['goal'], startDate: Date): string {
  const goalLabel = goal.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  const month = String(startDate.getMonth() + 1).padStart(2, '0')
  const day = String(startDate.getDate()).padStart(2, '0')
  return `${goalLabel} Block ${startDate.getFullYear()}-${month}-${day}`
}

/**
 * Determine training phase based on week number and total duration
 */
function determinePhase(weekNumber: number, totalWeeks: number): TrainingPhase {
  const basePhase = totalWeeks / 3
  const peak = Math.floor(totalWeeks * 0.6)
  const tapering = Math.floor(totalWeeks * 0.85)

  if (weekNumber <= basePhase) return 'base'
  if (weekNumber <= peak) return 'build'
  if (weekNumber <= tapering) return 'peak'
  return 'recovery'
}

/**
 * Determine focus points based on training goal and week
 */
function determineFocusPoints(weekNumber: number, totalWeeks: number, goal: string): string[] {
  const phase = determinePhase(weekNumber, totalWeeks)

  const focusMap: Record<string, Record<string, string[]>> = {
    ftp_increase: {
      base: ['Zone 2 endurance', 'Aerobic base building', 'Technique work'],
      build: ['Threshold work', 'VO2Max intervals', 'Sweet spot'],
      peak: ['FTP testing', 'High intensity', 'Power development'],
      recovery: ['Easy spins', 'Active recovery', 'Technique refinement'],
    },
    climbing_sustainability: {
      base: ['Climbing technique', 'Cadence control', 'Leg strength'],
      build: ['Steep gradient work', 'Power on climbs', 'Endurance climbing'],
      peak: ['Long climbs', 'High intensity climbs', 'Altitude simulation'],
      recovery: ['Recovery rides', 'Flexibility', 'Core stability'],
    },
    endurance: {
      base: ['Long steady rides', 'Nutrition strategy', 'Mental resilience'],
      build: ['Extended duration', 'Variable pace', 'Fatigue management'],
      peak: ['Century rides', 'Back-to-back days', 'Pacing strategy'],
      recovery: ['Active recovery', 'Stretching', 'Sleep optimization'],
    },
    recovery: {
      base: ['Gentle riding', 'Flexibility', 'Mobility work'],
      build: ['Gradual intensity increase', 'Low heart rate'],
      peak: [],
      recovery: ['Complete rest', 'Cross-training'],
    },
  }

  return focusMap[goal]?.[phase] || ['General cycling development']
}

/**
 * Generate training sessions for a week
 */
function generateWeekSessions(
  weekNumber: number,
  phase: TrainingPhase,
  userProfile: UserProfile,
  focusPoints: string[],
  totalWeeks: number,
  planStartDate: Date,
  blockedDates: Set<string>,
  previousWeekLoadScore?: number,
  context?: PlanGenerationContext
): TrainingSession[] {
  const sessions: TrainingSession[] = []
  const weekStartDate = new Date(planStartDate)
  weekStartDate.setDate(planStartDate.getDate() + (weekNumber - 1) * 7)
  const injuryConstraints = buildInjuryConstraints(userProfile.injuries)

  // Define session types and schedule based on phase
  const sessionTypes: SessionTemplate[] = []

  if (phase === 'base') {
    sessionTypes.push(
      { type: 'endurance', day: 1, duration: 90 },
      { type: 'tempo', day: 2, duration: 60 },
      { type: 'strength', day: 3, duration: 45 },
      { type: 'recovery', day: 4, duration: 45 },
      { type: 'threshold', day: 5, duration: 75 },
      { type: 'endurance', day: 6, duration: 120 },
      { type: 'recovery', day: 7, duration: 30 }
    )
  } else if (phase === 'build') {
    sessionTypes.push(
      { type: 'vo2max', day: 1, duration: 75 },
      { type: 'strength', day: 2, duration: 45 },
      { type: 'threshold', day: 3, duration: 90 },
      { type: 'recovery', day: 4, duration: 45 },
      { type: 'anaerobic', day: 5, duration: 60 },
      { type: 'endurance', day: 6, duration: 120 },
      { type: 'recovery', day: 7, duration: 30 }
    )
  } else if (phase === 'peak') {
    sessionTypes.push(
      { type: 'anaerobic', day: 1, duration: 60 },
      { type: 'recovery', day: 2, duration: 45 },
      { type: 'threshold', day: 3, duration: 75 },
      { type: 'vo2max', day: 4, duration: 60 },
      { type: 'recovery', day: 5, duration: 45 },
      { type: 'endurance', day: 6, duration: 150 },
      { type: 'recovery', day: 7, duration: 30 }
    )
  } else {
    sessionTypes.push(
      { type: 'recovery', day: 1, duration: 45 },
      { type: 'endurance', day: 2, duration: 75 },
      { type: 'recovery', day: 3, duration: 30 },
      { type: 'tempo', day: 4, duration: 60 },
      { type: 'recovery', day: 5, duration: 30 },
      { type: 'endurance', day: 6, duration: 90 },
      { type: 'recovery', day: 7, duration: 30 }
    )
  }

  const athleteSignatureBiasedTemplates = applyAthleteSignatureToSessionTemplates(
    sessionTypes,
    phase,
    userProfile.goal,
    context?.intervalsInsights?.athleteSignature
  )
  const intensityScale = getIntensityScale(context?.intervalsInsights)
  const variedSessionTypes = applyMicrocycleVariation(athleteSignatureBiasedTemplates, weekNumber, totalWeeks, phase)
  const preferredLongRideDay = getPreferredLongRideDay(weekStartDate, userProfile.availableTime)
  const longRideAlignedTemplates = placeLongRideTemplateOnPreferredDay(variedSessionTypes, preferredLongRideDay)
  const ftpTestKind = getFtpTestKindForWeek(weekNumber, totalWeeks, phase)
  const ftpTestDay = ftpTestKind
    ? getFtpTestTargetDay(longRideAlignedTemplates, weekStartDate, userProfile.availableTime)
    : null
  const adaptedSessionTypes = applyIntervalsInsightsToSessionTemplates({
    templates: longRideAlignedTemplates,
    insights: context?.intervalsInsights,
    phase,
  })
  const injuryAwareSessionTypes = applyInjuryConstraintsToSessionTemplates(adaptedSessionTypes, injuryConstraints, phase)
  const spacedSessionTypes = applyHardSessionSpacingGuardrails(
    injuryAwareSessionTypes,
    phase,
    userProfile.intensityDistribution || 'conservative'
  )
  const priorityShapedSessionTypes = applyEventPriorityToSessionTemplates(
    spacedSessionTypes,
    weekStartDate,
    userProfile.plannedEvents || []
  )
  const mixedSessionTypes = applyTimeConstrainedQualityMix({
    templates: priorityShapedSessionTypes,
    weekStartDate,
    availableTime: userProfile.availableTime,
    phase,
    weekNumber,
    equipment: userProfile.equipment,
    shortDayPreference: userProfile.shortDayPreference,
    qualityPriority: userProfile.qualityPriority,
  })
  const goalDirectedSessionTypes = applyGoalDirectedSessionDiversity({
    templates: mixedSessionTypes,
    weekStartDate,
    availableTime: userProfile.availableTime,
    phase,
    weekNumber,
    goal: userProfile.goal,
    intensityDistribution: userProfile.intensityDistribution,
    qualityPriority: userProfile.qualityPriority,
    hardSessionsPerWeekCap: userProfile.hardSessionsPerWeekCap,
    shortDayPreference: userProfile.shortDayPreference,
    equipment: userProfile.equipment,
  })
  const finalSessionTypes = applyHardSessionSpacingGuardrails(
    goalDirectedSessionTypes,
    phase,
    userProfile.intensityDistribution || 'conservative'
  )

  // Adjust for available time
  for (const sessionDef of finalSessionTypes) {
    const sessionDate = getSessionDateForDay(weekStartDate, sessionDef.day)
    const sessionDateKey = formatPlanStartDate(sessionDate)

    if (blockedDates.has(sessionDateKey)) {
      sessions.push(createRestDaySession(weekNumber, sessionDef.day, sessionDate))
      continue
    }

    const dayName = getDayNameFromDate(sessionDate)
    const availableHours = userProfile.availableTime[dayName as keyof typeof userProfile.availableTime] || 0
    const availableMinutes = Math.round(availableHours * 60)

    if (availableMinutes <= 0) {
      sessions.push(createRestDaySession(weekNumber, sessionDef.day, sessionDate))
      continue
    }

    const isFtpTestSession = ftpTestKind !== null && ftpTestDay === sessionDef.day && availableMinutes >= 50
    const adaptedType = isFtpTestSession
      ? 'threshold'
      : adaptSessionTypeForAvailability(sessionDef.type, availableMinutes, userProfile.shortDayPreference)
    let adjustedDuration = getAvailabilityDrivenDuration({
      sessionType: adaptedType,
      templateDuration: sessionDef.duration,
      availableMinutes,
    })
    adjustedDuration = applyInjuryDurationAdjustment(adjustedDuration, adaptedType, injuryConstraints)

    if (isFtpTestSession) {
      const testDuration = ftpTestKind === 'baseline' ? 75 : 70
      adjustedDuration = Math.max(55, Math.min(availableMinutes, testDuration))
    }

    // Keep the weekly long-ride anchor from collapsing when availability allows longer endurance work.
    const isLongRideSlot =
      sessionDef.day === preferredLongRideDay &&
      availableMinutes >= 90 &&
      adaptedType !== 'strength' &&
      adaptedType !== 'recovery'
    if (isLongRideSlot) {
      const anchoredLongRideDuration = getAnchoredLongRideDuration({
        weekNumber,
        totalWeeks,
        availableMinutes,
        phase,
      })
      adjustedDuration = Math.max(adjustedDuration, anchoredLongRideDuration)
    }

    if (adjustedDuration <= 0) {
      sessions.push(createRestDaySession(weekNumber, sessionDef.day, sessionDate))
      continue
    }

    const equipment = selectEquipmentForSession(adaptedType, userProfile.equipment)
    const structuredPrescription = buildStructuredWorkout({
      type: adaptedType,
      goal: userProfile.goal,
      phase,
      ftpTestKind: isFtpTestSession ? ftpTestKind || undefined : undefined,
      durationMinutes: adjustedDuration,
      weekNumber,
      totalWeeks,
      dayOfWeek: sessionDef.day,
      equipment,
      bodyWeightKg: userProfile.weight,
      ftp: userProfile.ftp,
      maxHeartRate: userProfile.maxHeartRate,
      hasPowerMeter: userProfile.hasPowerMeter,
      intensityScale: intensityScale * getInjuryIntensityScale(injuryConstraints),
      athleteSignature: context?.intervalsInsights?.athleteSignature,
      injuryConstraints,
    })

    const preDayNutritionTip = buildPreDayNutritionTip({
      sessionType: adaptedType,
      isFtpTest: isFtpTestSession,
      phase,
      weekNumber,
      durationMinutes: adjustedDuration,
      plannedEvents: userProfile.plannedEvents || [],
      sessionDate,
    })

    sessions.push({
      id: `session_${weekNumber}_${sessionDef.day}_${Date.now()}`,
      date: sessionDate,
      dayOfWeek: sessionDef.day,
      type: adaptedType,
      duration: adjustedDuration,
      intensity: getSessionIntensity(adaptedType),
      description: `${structuredPrescription.summary} (L${structuredPrescription.workoutLevel.toFixed(1)})`,
      preDayNutritionTip: preDayNutritionTip || undefined,
      focus: isFtpTestSession
        ? [...focusPoints, ftpTestKind === 'baseline' ? 'FTP baseline test' : 'FTP progress assessment']
        : addInjuryFocusPoints(focusPoints, injuryConstraints),
      equipment,
      notes: [`Workout Level: ${structuredPrescription.workoutLevel.toFixed(1)}`, ...structuredPrescription.steps].join('\n'),
      structuredWorkout: [`Workout Level ${structuredPrescription.workoutLevel.toFixed(1)}`, ...structuredPrescription.steps],
      plannedPower: isFtpTestSession
        ? undefined
        : userProfile.hasPowerMeter
        ? calculatePlannedPower(
            adaptedType,
            userProfile,
            intensityScale * getInjuryIntensityScale(injuryConstraints),
            phase,
            weekNumber,
            totalWeeks
          )
        : undefined,
      plannedHeartRate: isFtpTestSession
        ? undefined
        : userProfile.hasPowerMeter
        ? undefined
        : calculatePlannedHeartRate(
            adaptedType,
            userProfile,
            intensityScale * getInjuryIntensityScale(injuryConstraints),
            phase,
            weekNumber,
            totalWeeks
          ),
    })
  }

  const sortedSessions = sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  return applyWeeklyLoadBudget({
    sessions: sortedSessions,
    phase,
    weekNumber,
    previousWeekLoadScore,
  })
}

function priorityWeight(priority: EventPriority): number {
  if (priority === 'A') return 3
  if (priority === 'B') return 2
  return 1
}

function daysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.floor((end - start) / (24 * 60 * 60 * 1000))
}

function isHighIntensity(type: SessionType): boolean {
  return type === 'threshold' || type === 'vo2max' || type === 'anaerobic'
}

function applyEventPriorityToSessionTemplates(
  templates: SessionTemplate[],
  weekStartDate: Date,
  plannedEvents: UserProfile['plannedEvents']
): SessionTemplate[] {
  if (!plannedEvents || plannedEvents.length === 0) {
    return templates
  }

  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekStartDate.getDate() + 6)

  const relevantEvents = plannedEvents
    .map((event) => ({ ...event, parsedDate: new Date(event.date) }))
    .filter((event) => !Number.isNaN(event.parsedDate.getTime()))
    .filter((event) => {
      const daysToEvent = daysBetween(weekEndDate, event.parsedDate)
      return daysToEvent >= -1 && daysToEvent <= 21
    })
    .sort((a, b) => {
      const byPriority = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (byPriority !== 0) return byPriority
      return a.parsedDate.getTime() - b.parsedDate.getTime()
    })

  if (relevantEvents.length === 0) {
    return templates
  }

  const topEvent = relevantEvents[0]
  const daysToEvent = daysBetween(weekEndDate, topEvent.parsedDate)
  const adjusted = templates.map((template) => ({ ...template }))

  if (topEvent.priority === 'A' && daysToEvent <= 6) {
    return adjusted.map((template) => {
      if (isHighIntensity(template.type)) {
        return { ...template, type: 'tempo', duration: Math.max(45, Math.round(template.duration * 0.7)) }
      }
      if (template.type === 'endurance') {
        return { ...template, duration: Math.max(60, Math.round(template.duration * 0.8)) }
      }
      return template
    })
  }

  if (topEvent.priority === 'A' && daysToEvent <= 13) {
    let keySessionKept = false
    return adjusted.map((template) => {
      if (isHighIntensity(template.type)) {
        if (!keySessionKept) {
          keySessionKept = true
          return { ...template, duration: Math.max(50, Math.round(template.duration * 0.85)) }
        }
        return { ...template, type: 'tempo', duration: Math.max(45, Math.round(template.duration * 0.8)) }
      }
      return template
    })
  }

  if (topEvent.priority === 'B' && daysToEvent <= 8) {
    return adjusted.map((template) => {
      if (isHighIntensity(template.type)) {
        return { ...template, duration: Math.max(45, Math.round(template.duration * 0.85)) }
      }
      return template
    })
  }

  return adjusted
}

function getSessionDateForDay(weekStartDate: Date, dayOfWeek: number): Date {
  const sessionDate = new Date(weekStartDate)
  sessionDate.setDate(weekStartDate.getDate() + (dayOfWeek - 1))
  return sessionDate
}

function createRestDaySession(weekNumber: number, dayOfWeek: number, sessionDate: Date): TrainingSession {
  return {
    id: `session_${weekNumber}_${dayOfWeek}_rest_${Date.now()}`,
    date: sessionDate,
    dayOfWeek,
    type: 'recovery',
    duration: 0,
    intensity: 'easy',
    description: 'Rest Day',
    focus: ['Recovery and adaptation'],
    equipment: [],
    notes: 'Full rest day. Optional: 10-15min mobility and light stretching.',
    structuredWorkout: ['Rest day', 'Optional: 10-15min mobility and stretching'],
  }
}

type AvailabilityDrivenDurationOptions = {
  sessionType: SessionType
  templateDuration: number
  availableMinutes: number
}

function getAvailabilityDrivenDuration({
  sessionType,
  templateDuration,
  availableMinutes,
}: AvailabilityDrivenDurationOptions): number {
  const maxDurationByType: Record<SessionType, number> = {
    recovery: 90,
    endurance: 240,
    tempo: 140,
    threshold: 130,
    vo2max: 95,
    anaerobic: 80,
    strength: 80,
  }

  if (availableMinutes < 25) {
    return 0
  }

  const baseDuration = Math.max(templateDuration, 30)
  const extensibilityByType: Record<SessionType, number> = {
    recovery: 1.5,
    endurance: 2,
    tempo: 1.35,
    threshold: 1.25,
    vo2max: 1.2,
    anaerobic: 1.15,
    strength: 1.2,
  }

  const maxAdaptiveDuration = Math.round(baseDuration * extensibilityByType[sessionType])
  const duration = Math.min(availableMinutes, maxAdaptiveDuration, maxDurationByType[sessionType])

  return Math.max(20, Math.round(duration / 5) * 5)
}

type AnchoredLongRideOptions = {
  weekNumber: number
  totalWeeks: number
  availableMinutes: number
  phase: TrainingPhase
}

function getAnchoredLongRideDuration({ weekNumber, totalWeeks, availableMinutes, phase }: AnchoredLongRideOptions): number {
  if (availableMinutes < 75) {
    return Math.max(20, Math.round(availableMinutes / 5) * 5)
  }

  if (phase === 'recovery') {
    const recoveryTarget = Math.min(120, availableMinutes)
    return Math.max(90, Math.round(recoveryTarget / 5) * 5)
  }

  const progression = getWeekProgression(weekNumber, totalWeeks)
  const baseTarget = 120 + Math.round(progression * 60) // 2h -> 3h progression when availability permits
  const weekInBlock = ((weekNumber - 1) % 4) + 1
  const deloadTarget = weekInBlock === 4 ? Math.round(baseTarget * 0.85) : baseTarget
  const duration = Math.min(availableMinutes, deloadTarget, 240)

  return Math.max(90, Math.round(duration / 5) * 5)
}

function adaptSessionTypeForAvailability(
  type: SessionType,
  availableMinutes: number,
  shortDayPreference?: UserProfile['shortDayPreference']
): SessionType {
  const prefersVo2Micro = shortDayPreference === 'vo2_micro'
  const isHardType = type === 'threshold' || type === 'vo2max' || type === 'anaerobic'

  if (availableMinutes < 35) {
    // Preserve short high-quality intent for micro-interval focused plans instead
    // of defaulting to recovery whenever availability is tight.
    if (prefersVo2Micro && isHardType && availableMinutes >= 30) {
      return 'vo2max'
    }

    return 'recovery'
  }

  if (availableMinutes < 50 && isHardType) {
    if (prefersVo2Micro) {
      return 'vo2max'
    }

    return 'tempo'
  }

  return type
}

type ApplyTimeConstrainedQualityMixOptions = {
  templates: SessionTemplate[]
  weekStartDate: Date
  availableTime: UserProfile['availableTime']
  phase: TrainingPhase
  weekNumber: number
  equipment: Equipment[]
  shortDayPreference?: UserProfile['shortDayPreference']
  qualityPriority?: UserProfile['qualityPriority']
}

function applyTimeConstrainedQualityMix({
  templates,
  weekStartDate,
  availableTime,
  phase,
  weekNumber,
  equipment,
  shortDayPreference,
  qualityPriority,
}: ApplyTimeConstrainedQualityMixOptions): SessionTemplate[] {
  if (phase === 'recovery') {
    return templates
  }

  const adjusted = templates.map((template) => ({ ...template }))
  const hardTypes: SessionType[] = ['threshold', 'vo2max', 'anaerobic']
  const hardCount = adjusted.filter((template) => hardTypes.includes(template.type)).length
  const hasStrength = adjusted.some((template) => template.type === 'strength')
  const hasStrengthEquipment = equipment.some((item) => item === 'dumbbells' || item === 'resistance_bands' || item === 'rowing_machine')

  const shortWindowRecoveryCandidates = adjusted
    .filter((template) => template.type === 'recovery')
    .map((template) => {
      const sessionDate = getSessionDateForDay(weekStartDate, template.day)
      const dayName = getDayNameFromDate(sessionDate) as keyof UserProfile['availableTime']
      const availableMinutes = Math.round((availableTime[dayName] || 0) * 60)
      return { template, availableMinutes }
    })
    .filter((candidate) => candidate.availableMinutes >= 50 && candidate.availableMinutes <= 75)
    .sort((left, right) => right.availableMinutes - left.availableMinutes)

  if (shortWindowRecoveryCandidates.length === 0) {
    return adjusted
  }

  const weekInBlock = getTrainingBlockWeek(weekNumber)
  const primaryCandidate = shortWindowRecoveryCandidates[0].template

  const qualityBump = qualityPriority === 'aggressive' ? 5 : qualityPriority === 'conservative' ? -5 : 0

  if (shortDayPreference === 'strength_focus' && !hasStrength && hasStrengthEquipment) {
    primaryCandidate.type = 'strength'
    primaryCandidate.duration = Math.max(45, primaryCandidate.duration)
  } else if (shortDayPreference === 'threshold_blocks') {
    primaryCandidate.type = 'threshold'
    primaryCandidate.duration = Math.max(55 + qualityBump, primaryCandidate.duration)
  } else if (shortDayPreference === 'vo2_micro') {
    primaryCandidate.type = 'vo2max'
    primaryCandidate.duration = Math.max(50 + qualityBump, primaryCandidate.duration)
  } else if (hardCount <= 1 && weekInBlock !== 4) {
    primaryCandidate.type = 'vo2max'
    primaryCandidate.duration = Math.max(55 + qualityBump, primaryCandidate.duration)
  } else if (!hasStrength && hasStrengthEquipment) {
    primaryCandidate.type = 'strength'
    primaryCandidate.duration = Math.max(45, primaryCandidate.duration)
  } else {
    primaryCandidate.type = 'tempo'
    primaryCandidate.duration = Math.max(50 + qualityBump, primaryCandidate.duration)
  }

  return adjusted
}

type ApplyGoalDirectedSessionDiversityOptions = {
  templates: SessionTemplate[]
  weekStartDate: Date
  availableTime: UserProfile['availableTime']
  phase: TrainingPhase
  weekNumber: number
  goal: UserProfile['goal']
  intensityDistribution?: UserProfile['intensityDistribution']
  qualityPriority?: UserProfile['qualityPriority']
  hardSessionsPerWeekCap?: UserProfile['hardSessionsPerWeekCap']
  shortDayPreference?: UserProfile['shortDayPreference']
  equipment: Equipment[]
}

function applyGoalDirectedSessionDiversity({
  templates,
  weekStartDate,
  availableTime,
  phase,
  weekNumber,
  goal,
  intensityDistribution,
  qualityPriority,
  hardSessionsPerWeekCap,
  shortDayPreference,
  equipment,
}: ApplyGoalDirectedSessionDiversityOptions): SessionTemplate[] {
  if (phase === 'recovery') {
    return templates
  }

  const adjusted = templates.map((template) => ({ ...template }))
  const weekInBlock = getTrainingBlockWeek(weekNumber)
  const isDeloadWeek = weekInBlock === 4

  const hardTypes: SessionType[] = ['threshold', 'vo2max', 'anaerobic']
  const hasStrengthEquipment = equipment.some((item) => item === 'dumbbells' || item === 'resistance_bands' || item === 'rowing_machine')
  const distributionDefaultCap = intensityDistribution === 'aggressive' ? 3 : 2
  const configuredCapRaw = hardSessionsPerWeekCap ?? distributionDefaultCap
  const configuredCap = Math.min(3, Math.max(1, configuredCapRaw))
  const maxHardSessions = isDeloadWeek ? 1 : configuredCap
  const thresholdTarget = qualityPriority === 'conservative' ? 1 : 2

  const hardCount = adjusted.filter((template) => hardTypes.includes(template.type)).length
  const thresholdLikeCount = adjusted.filter((template) => template.type === 'threshold' || template.type === 'tempo').length
  const strengthCount = adjusted.filter((template) => template.type === 'strength').length

  const candidateSlots = adjusted
    .map((template) => {
      const sessionDate = getSessionDateForDay(weekStartDate, template.day)
      const dayName = getDayNameFromDate(sessionDate) as keyof UserProfile['availableTime']
      const availableMinutes = Math.round((availableTime[dayName] || 0) * 60)
      return { template, availableMinutes }
    })
    .filter((candidate) => candidate.availableMinutes >= 50)
    .sort((left, right) => right.availableMinutes - left.availableMinutes)

  const promoteRecoverySlot = (targetType: SessionType, minimumDuration: number): boolean => {
    const candidate = candidateSlots.find((slot) => slot.template.type === 'recovery')
    if (!candidate) {
      return false
    }

    candidate.template.type = targetType
    candidate.template.duration = Math.max(minimumDuration, candidate.template.duration)
    return true
  }

  if (hardCount < maxHardSessions && !isDeloadWeek) {
    const preferredHardType: SessionType =
      shortDayPreference === 'threshold_blocks'
        ? 'threshold'
        : shortDayPreference === 'vo2_micro'
        ? 'vo2max'
        : goal === 'endurance'
        ? 'threshold'
        : goal === 'recovery'
        ? 'tempo'
        : 'vo2max'
    promoteRecoverySlot(preferredHardType, 55)
  }

  if (thresholdLikeCount < thresholdTarget && phase !== 'peak') {
    promoteRecoverySlot('tempo', 50)
  }

  if ((strengthCount === 0 || shortDayPreference === 'strength_focus') && hasStrengthEquipment && phase !== 'peak') {
    promoteRecoverySlot('strength', 45)
  }

  return adjusted.sort((a, b) => a.day - b.day)
}

type BuildPreDayNutritionTipOptions = {
  sessionType: SessionType
  isFtpTest: boolean
  phase: TrainingPhase
  weekNumber: number
  durationMinutes: number
  plannedEvents: NonNullable<UserProfile['plannedEvents']>
  sessionDate: Date
}

/**
 * Returns a short, actionable nutrition tip for the evening before a hard
 * session, FTP test, or A/B priority race. Returns null for easy/recovery
 * sessions where extra fueling prep is not needed.
 */
function buildPreDayNutritionTip({
  sessionType,
  isFtpTest,
  phase,
  weekNumber,
  durationMinutes,
  plannedEvents,
  sessionDate,
}: BuildPreDayNutritionTipOptions): string | null {
  // Check if this session date is an A- or B-priority race day
  const sessionDateKey = formatPlanStartDate(sessionDate)
  const raceOnSessionDay = plannedEvents
    .filter((event) => event.priority === 'A' || event.priority === 'B')
    .find((event) => event.date === sessionDateKey)

  if (raceOnSessionDay) {
    const isAEvent = raceOnSessionDay.priority === 'A'
    return isAEvent
      ? `Race day: eat 3–4h before start. Focus on familiar, high-carb foods (rice, pasta, toast with jam) to top up glycogen. Avoid high-fat, high-fibre, and anything new. Aim for ~3–4g carbs/kg bodyweight the evening before and ~1–2g/kg 2–3h before the start. Stay well-hydrated.`
      : `B-event day: treat like a quality training session. Eat a familiar carb-rich meal (pasta, rice, bread) the evening before. Morning of: 1–2g carbs/kg 2–3h before, with coffee if routine. Avoid heavy proteins or fats before the session.`
  }

  // Check if the day after is a race — this session is final pre-race activation
  const tomorrowDate = new Date(sessionDate)
  tomorrowDate.setDate(sessionDate.getDate() + 1)
  const tomorrowKey = formatPlanStartDate(tomorrowDate)
  const raceNextDay = plannedEvents
    .filter((event) => event.priority === 'A' || event.priority === 'B')
    .find((event) => event.date === tomorrowKey)

  if (raceNextDay) {
    const isAEvent = raceNextDay.priority === 'A'
    return isAEvent
      ? `Pre-race activation day: keep this session very short and light. Evening meal tonight should be your carb-loading dinner — 4–5g carbs/kg bodyweight. Classic choices: pasta with light tomato sauce, white rice, bread. Avoid anything heavy, spicy, or high in fibre. Keep fat moderate. Hydrate well through the day. No alcohol.`
      : `Light day before a B-event: normal balanced dinner — carbs, lean protein, moderate fat. No need to carb-load heavily; just avoid heavy or unfamiliar foods tonight.`
  }

  // FTP test
  if (isFtpTest) {
    return `FTP test tomorrow: the evening before, eat a familiar carb-rich dinner (pasta, rice or bread) — similar to what you eat before your best sessions. Avoid excess fat or fibre. Aim for 3–4g carbs/kg. Morning of: coffee if usual, a light carb snack (banana, toast) 1.5–2h before. Sleep well — test quality is the biggest lever.`
  }

  // Hard sessions only
  const isHard = sessionType === 'threshold' || sessionType === 'vo2max' || sessionType === 'anaerobic'
  if (!isHard) {
    return null
  }

  const isLong = durationMinutes >= 80

  if (sessionType === 'vo2max') {
    return isLong
      ? `VO2 session tomorrow (${durationMinutes} min): eat a full carb-based dinner tonight — pasta, rice or sweet potato with lean protein. Aim for 3–4g carbs/kg. Avoid high-fat sauces and high-fibre vegetables before bed. Morning of: a banana or toast with jam 1–1.5h before is enough.`
      : `VO2 session tomorrow: make sure dinner includes a solid carb source (rice, pasta, bread). Glycogen availability matters more for short, high-intensity work than people expect. Morning of: coffee if usual, a banana or bowl of oats 1–2h before.`
  }

  if (sessionType === 'threshold') {
    const weekInBlock = getTrainingBlockWeek(weekNumber)
    const isDeloadWeek = weekInBlock === 4
    return isDeloadWeek
      ? `Deload threshold session tomorrow: no need for special fueling. A normal balanced dinner is enough — moderate carbs, lean protein, vegetables. Light carb snack morning of is optional.`
      : isLong
      ? `Threshold session tomorrow (${durationMinutes} min): top up glycogen tonight with a carb-dominant dinner (rice, pasta, bread). Aim for 3–4g carbs/kg. Lean protein is fine; avoid heavy fats and excess fibre. Morning of: oats, toast or a banana 1.5–2h before, with coffee if routine.`
      : `Threshold session tomorrow: eat a proper dinner with a solid carb portion (rice, pasta or potatoes). Glycogen depletion is a common hidden limiter for threshold quality. Morning of: a light carb snack 1–1.5h before is enough if dinner was solid.`
  }

  if (sessionType === 'anaerobic') {
    return `Anaerobic session tomorrow: anaerobic work relies heavily on glycogen. Eat a carb-rich dinner tonight (pasta, rice, bread). Keep fat moderate so digestion is complete by morning. Morning of: a small, familiar snack (banana, white toast with jam) 1–1.5h before. Stay well-hydrated — even mild dehydration cuts sprint power significantly.`
  }

  return null
}

function getDayNameFromDate(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[date.getDay()]
}

function getPreferredLongRideDay(
  weekStartDate: Date,
  availableTime: UserProfile['availableTime']
): number {
  let bestDay = 6
  let bestMinutes = -1

  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
    const sessionDate = getSessionDateForDay(weekStartDate, dayOfWeek)
    const dayName = getDayNameFromDate(sessionDate) as keyof UserProfile['availableTime']
    const availableMinutes = Math.round((availableTime[dayName] || 0) * 60)

    if (availableMinutes > bestMinutes) {
      bestMinutes = availableMinutes
      bestDay = dayOfWeek
    }
  }

  return bestDay
}

function getFtpTestKindForWeek(
  weekNumber: number,
  totalWeeks: number,
  phase: TrainingPhase
): 'baseline' | 'assessment' | null {
  if (weekNumber === 1) {
    return 'baseline'
  }

  if (phase === 'recovery') {
    return null
  }

  if (weekNumber > 1 && (weekNumber - 1) % 4 === 0) {
    return 'assessment'
  }

  if (weekNumber === totalWeeks && totalWeeks >= 6) {
    return 'assessment'
  }

  return null
}

function getFtpTestTargetDay(
  templates: SessionTemplate[],
  weekStartDate: Date,
  availableTime: UserProfile['availableTime']
): number | null {
  const preferredTypes: SessionType[] = ['threshold', 'tempo', 'endurance', 'vo2max', 'anaerobic']

  const candidates = templates
    .filter((template) => preferredTypes.includes(template.type))
    .map((template) => {
      const dayName = getDayNameFromDate(getSessionDateForDay(weekStartDate, template.day)) as keyof UserProfile['availableTime']
      const availableMinutes = Math.round((availableTime[dayName] || 0) * 60)
      return {
        day: template.day,
        typePriority: preferredTypes.indexOf(template.type),
        availableMinutes,
      }
    })
    .sort((a, b) => b.availableMinutes - a.availableMinutes || a.typePriority - b.typePriority)

  const viable = candidates.find((candidate) => candidate.availableMinutes >= 50)
  return viable ? viable.day : null
}

function placeLongRideTemplateOnPreferredDay(templates: SessionTemplate[], preferredDay: number): SessionTemplate[] {
  const adjusted = templates.map((template) => ({ ...template }))
  const candidate =
    adjusted
      .filter((template) => template.type === 'endurance')
      .sort((a, b) => b.duration - a.duration)[0] ||
    adjusted
      .filter((template) => template.type === 'tempo')
      .sort((a, b) => b.duration - a.duration)[0]

  if (!candidate || candidate.day === preferredDay) {
    return adjusted
  }

  const target = adjusted.find((template) => template.day === preferredDay)
  if (!target) {
    candidate.day = preferredDay
    return adjusted
  }

  const originalCandidateDay = candidate.day
  candidate.day = preferredDay
  target.day = originalCandidateDay

  return adjusted
}

function selectEquipmentForSession(type: SessionType, availableEquipment: Equipment[]): Equipment[] {
  const strengthEquipment: Equipment[] = ['resistance_bands', 'dumbbells', 'rowing_machine']
  const indoorTrainer: Equipment[] = ['indoor_trainer']

  if (type === 'strength') {
    return availableEquipment.filter((equipment) => strengthEquipment.includes(equipment))
  }

  if (availableEquipment.includes('indoor_trainer')) {
    return indoorTrainer
  }

  if (type === 'recovery') {
    return []
  }

  return []
}

function getSessionIntensity(type: SessionType): 'easy' | 'moderate' | 'hard' | 'very_hard' {
  const intensityMap: Record<SessionType, 'easy' | 'moderate' | 'hard' | 'very_hard'> = {
    recovery: 'easy',
    endurance: 'easy',
    tempo: 'moderate',
    threshold: 'hard',
    vo2max: 'very_hard',
    anaerobic: 'very_hard',
    strength: 'moderate',
  }
  return intensityMap[type]
}

function getSessionDescription(type: SessionType, focusPoints: string[]): string {
  const descriptions: Record<SessionType, string> = {
    recovery: 'Easy pace, focus on spinning and recovery',
    endurance: 'Steady effort, build aerobic base',
    tempo: 'Moderate-hard effort, build lactate threshold',
    threshold: 'Hard efforts at/near FTP, improve sustainability',
    vo2max: 'Very hard intervals, improve oxygen utilization',
    anaerobic: 'Maximum effort intervals, build power',
    strength: 'Strength and conditioning, build power off the bike',
  }
  return `${descriptions[type]} - Focus: ${focusPoints[0] || 'general development'}`
}

type StructuredWorkoutOptions = {
  type: SessionType
  goal: UserProfile['goal']
  phase: TrainingPhase
  ftpTestKind?: 'baseline' | 'assessment'
  durationMinutes: number
  weekNumber: number
  totalWeeks: number
  dayOfWeek: number
  equipment: Equipment[]
  bodyWeightKg?: number
  ftp?: number
  maxHeartRate?: number
  hasPowerMeter: boolean
  intensityScale: number
  athleteSignature?: AthleteRideSignature
  injuryConstraints: InjuryConstraints
}

type InjuryConstraints = {
  hasKneeIssues: boolean
  hasLowerBackIssues: boolean
  hasShoulderIssues: boolean
  hasAny: boolean
}

type StructuredWorkout = {
  summary: string
  steps: string[]
  workoutLevel: number
}

function buildStructuredWorkout({
  type,
  goal,
  phase,
  ftpTestKind,
  durationMinutes,
  weekNumber,
  totalWeeks,
  dayOfWeek,
  equipment,
  bodyWeightKg,
  ftp,
  maxHeartRate,
  hasPowerMeter,
  intensityScale,
  athleteSignature,
  injuryConstraints,
}: StructuredWorkoutOptions): StructuredWorkout {
  const ftpValue = ftp || 220
  const hrValue = maxHeartRate || 190
  const progression = getWeekProgression(weekNumber, totalWeeks)
  const phaseBias: Record<TrainingPhase, number> = {
    base: -0.01,
    build: 0.02,
    peak: 0.03,
    recovery: -0.05,
  }
  const progressionScale = clamp(0.9, 1.1, 1 + phaseBias[phase] + progression * 0.04)

  const powerOrHr = ({ minPct, maxPct }: { minPct: number; maxPct: number }): string => {
    const scaledMinPct = Math.max(0.45, minPct * intensityScale * progressionScale)
    const scaledMaxPct = Math.min(1.6, maxPct * intensityScale * progressionScale)

    if (hasPowerMeter) {
      return `${Math.round(ftpValue * scaledMinPct)}-${Math.round(ftpValue * scaledMaxPct)}W (${Math.round(scaledMinPct * 100)}-${Math.round(scaledMaxPct * 100)}% FTP)`
    }

    return `${Math.round(hrValue * scaledMinPct)}-${Math.round(hrValue * scaledMaxPct)} bpm (${Math.round(scaledMinPct * 100)}-${Math.round(scaledMaxPct * 100)}% HRmax)`
  }

  const defaultWarmup = Math.min(15, Math.max(8, Math.round(durationMinutes * 0.2)))
  const defaultCooldown = Math.min(10, Math.max(5, Math.round(durationMinutes * 0.15)))
  const variantCount = type === 'threshold' || type === 'anaerobic' ? 5 : 4
  const workoutVariant = getWorkoutVariantIndex(type, weekNumber, dayOfWeek, variantCount)
  const signatureAdjustedVariant = getAthleteSignatureWorkoutVariant(type, workoutVariant, phase, athleteSignature)
  const safeVariant = getInjurySafeWorkoutVariant(type, signatureAdjustedVariant, injuryConstraints)
  const progressionLevel = getSessionProgressionLevel(type, phase, weekNumber, totalWeeks)
  const workoutLevel = Number((progressionLevel + (safeVariant === 0 ? 0 : safeVariant * 0.2)).toFixed(1))
  const weekInBlock = getTrainingBlockWeek(weekNumber)
  const usesRower = equipment.includes('rowing_machine') && !equipment.includes('indoor_trainer')

  if (ftpTestKind) {
    const ftpTestLevel = ftpTestKind === 'baseline' ? 4.5 : 6.5
    const intro = ftpTestKind === 'baseline' ? 'FTP Baseline Test' : 'FTP Progress Assessment'

    return {
      summary: intro,
      workoutLevel: ftpTestLevel,
      steps: [
        `Warm-up ${Math.max(15, defaultWarmup)}' easy spin + 3x1' progressive openers`,
        `Pre-load 5' strong at ${powerOrHr({ minPct: 1.02, maxPct: 1.08 })}, then 10' easy recovery`,
        hasPowerMeter
          ? `20' all-out steady test effort; estimate FTP as 95% of average 20' power`
          : `20' maximal steady effort at RPE 9/10; use this to recalibrate threshold HR and perceived effort`,
        `Cool-down ${Math.max(10, defaultCooldown)}' easy spin`,
        `Record result and update training targets before the next hard block`,
      ],
    }
  }

  const rowerTarget = ({ minPct, maxPct, cadenceMin, cadenceMax }: { minPct: number; maxPct: number; cadenceMin: number; cadenceMax: number }): string => {
    const scaledMinPct = Math.max(0.45, minPct * intensityScale * progressionScale)
    const scaledMaxPct = Math.min(1.3, maxPct * intensityScale * progressionScale)
    const lowWatts = Math.round(ftpValue * scaledMinPct)
    const highWatts = Math.round(ftpValue * scaledMaxPct)
    return `${lowWatts}-${highWatts}W @ ${cadenceMin}-${cadenceMax} spm`
  }

  if (usesRower && type !== 'strength') {
    if (type === 'threshold') {
      return {
        summary: 'Rowing Threshold 4x6\'',
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy row + 3x20'' stroke builds`,
          `4x6' at ${rowerTarget({ minPct: 0.88, maxPct: 0.96, cadenceMin: 24, cadenceMax: 28 })}`,
          `Recovery 3' easy row @ 18-20 spm between reps`,
          `Cool-down ${defaultCooldown}' easy row`,
        ],
      }
    }

    if (type === 'vo2max') {
      return {
        summary: 'Rowing VO2Max 6x3\'',
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive with 3x30'' high-rate starts`,
          `6x3' at ${rowerTarget({ minPct: 1.0, maxPct: 1.08, cadenceMin: 28, cadenceMax: 32 })}`,
          `Recovery 3' easy row @ 18-20 spm`,
          `Cool-down ${defaultCooldown}' easy row`,
        ],
      }
    }

    if (type === 'anaerobic') {
      return {
        summary: 'Rowing Anaerobic 10x1\'',
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy + acceleration strokes`,
          `10x1' hard at ${rowerTarget({ minPct: 1.08, maxPct: 1.18, cadenceMin: 30, cadenceMax: 34 })}`,
          `Recovery 2' easy row @ 18-20 spm`,
          `Cool-down ${defaultCooldown}' easy row`,
        ],
      }
    }

    if (type === 'tempo') {
      return {
        summary: 'Rowing Tempo 3x8\'',
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy row`,
          `3x8' at ${rowerTarget({ minPct: 0.78, maxPct: 0.86, cadenceMin: 22, cadenceMax: 26 })}`,
          `Recovery 3' easy row @ 18-20 spm`,
          `Cool-down ${defaultCooldown}' easy row`,
        ],
      }
    }

    if (type === 'endurance') {
      const mainBlock = Math.max(20, durationMinutes - defaultWarmup - defaultCooldown)
      return {
        summary: 'Rowing Aerobic Endurance',
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy row`,
          `Main ${mainBlock}' steady at ${rowerTarget({ minPct: 0.62, maxPct: 0.74, cadenceMin: 20, cadenceMax: 24 })}`,
          `Optional: every 12' add 20'' high-cadence stroke burst (28-30 spm)`,
          `Cool-down ${defaultCooldown}' easy row`,
        ],
      }
    }

    return {
      summary: 'Rowing Recovery',
      workoutLevel,
      steps: [
        `Easy row ${Math.max(20, durationMinutes - 5)}' at ${rowerTarget({ minPct: 0.5, maxPct: 0.6, cadenceMin: 18, cadenceMax: 22 })}`,
        `Finish with 5' mobility: hips, thoracic spine, hamstrings`,
      ],
    }
  }

  if (type === 'threshold') {
    const baseWork = 8 + Math.round(progressionLevel * 0.8)
    const intervals = clamp(2, 5, 2 + Math.round(progressionLevel / 3))
    const recover = weekInBlock === 4 ? 4 : 3

    if (safeVariant === 1) {
      const blockMinutes = clamp(8, 14, baseWork)
      return {
        summary: `Threshold Over-Under ${intervals}x${blockMinutes}'`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy spin + 3x30'' cadence ramps`,
          `${intervals}x${blockMinutes}' alternating 2' at ${powerOrHr({ minPct: 0.9, maxPct: 0.95 })} / 1' at ${powerOrHr({ minPct: 1.0, maxPct: 1.05 })}`,
          `Recovery ${recover}' easy between efforts`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 2) {
      const cruiseMinutes = clamp(10, 18, baseWork + 2)
      return {
        summary: `Threshold Cruise ${intervals}x${cruiseMinutes}'`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive`,
          `${intervals}x${cruiseMinutes}' at ${powerOrHr({ minPct: 0.95, maxPct: 1.0 })}`,
          `Recovery ${recover + 1}' easy between reps`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 3) {
      const sets = clamp(2, 4, 2 + Math.floor(progressionLevel / 4))
      return {
        summary: `Lactate Threshold 40/20 ${sets} sets`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy spin + 3x1' ramps`,
          `${sets} sets: 8x40'' at ${powerOrHr({ minPct: 0.98, maxPct: 1.03 })} / 20'' float at ${powerOrHr({ minPct: 0.82, maxPct: 0.88 })}`,
          `Set recovery 5' easy spin`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 4) {
      const blockMinutes = clamp(8, 15, 8 + Math.round(progressionLevel * 0.55))
      const reps = progressionLevel >= 7 ? 4 : 3
      const recover = weekInBlock === 4 ? 10 : 8
      return {
        summary: `Supra-Threshold Power ${reps}x${blockMinutes}'`,
        workoutLevel,
        steps: [
          `Warm-up ${Math.max(15, defaultWarmup)}' progressive + 3x1' at ${powerOrHr({ minPct: 0.98, maxPct: 1.03 })} as openers`,
          `${reps}x${blockMinutes}' at ${powerOrHr({ minPct: 1.05, maxPct: 1.1 })} — even pacing across all reps (RPE 8.5/10)`,
          `Recovery ${recover}' easy spin between reps — full recovery is essential`,
          `Cool-down ${defaultCooldown}' easy spin`,
          `Adaptation: extends sustainable power above FTP; key stimulus for raising functional threshold`,
        ],
      }
    }

    const work = clamp(8, 20, baseWork)

    return {
      summary: `Threshold ${intervals}x${work}'`,
      workoutLevel,
      steps: [
        `Warm-up ${defaultWarmup}' easy spin + 3x30'' cadence ramps`,
        `${intervals}x${work}' at ${powerOrHr({ minPct: 0.95, maxPct: 1.0 })}`,
        `Recovery ${recover}' easy between efforts`,
        `Cool-down ${defaultCooldown}' easy spin`,
      ],
    }
  }

  if (type === 'vo2max') {
    const reps = clamp(4, 8, 4 + Math.round(progressionLevel / 2))
    const weekInBlock = getTrainingBlockWeek(weekNumber)
    const microPhaseEligible = phase === 'peak' || (phase === 'build' && weekInBlock >= 2)
    const microSessionSelector = (weekNumber + dayOfWeek + safeVariant) % 5
    const shouldUseMicroIntervals = microPhaseEligible && microSessionSelector < (phase === 'peak' ? 5 : 4)

    if (safeVariant === 1 || safeVariant === 3 || shouldUseMicroIntervals) {
      const canUseMicroIntervalProgressions = microPhaseEligible
      const preferredMicroInterval = getPreferredVo2MicroInterval(goal)
      const alternatesTowardFortyTwenty = (weekNumber + dayOfWeek + safeVariant) % 2 === 0
      const forceThirtyFifteen = canUseMicroIntervalProgressions && shouldForceThirtyFifteenSession(weekNumber, phase)
      const usesFortyTwenty =
        !forceThirtyFifteen &&
        canUseMicroIntervalProgressions &&
        (preferredMicroInterval === '40/20' || (preferredMicroInterval === 'mixed' && alternatesTowardFortyTwenty))
      const fortyTwentyReps = getFortyTwentyRepsForWeek(weekNumber, phase)
      const ronnestadSets = getThirtyFifteenSetsForWeek(weekNumber, phase)
      const repsPerSet = usesFortyTwenty ? fortyTwentyReps : canUseMicroIntervalProgressions ? 13 : 10
      const sets = usesFortyTwenty ? 1 : canUseMicroIntervalProgressions ? ronnestadSets : clamp(2, 4, 2 + Math.floor(progressionLevel / 4))
      const workSeconds = usesFortyTwenty ? 40 : 30
      const floatSeconds = usesFortyTwenty ? 20 : canUseMicroIntervalProgressions ? 15 : 30
      const setRecoveryMinutes = usesFortyTwenty ? 4 : canUseMicroIntervalProgressions ? 5 : 4
      const workTarget = usesFortyTwenty
        ? powerOrHr({ minPct: 1.1, maxPct: 1.2 })
        : canUseMicroIntervalProgressions
        ? powerOrHr({ minPct: 1.14, maxPct: 1.24 })
        : powerOrHr({ minPct: 1.15, maxPct: 1.25 })
      const floatTarget = usesFortyTwenty
        ? powerOrHr({ minPct: 0.6, maxPct: 0.7 })
        : canUseMicroIntervalProgressions
        ? powerOrHr({ minPct: 0.65, maxPct: 0.75 })
        : 'easy'
      const workoutName = usesFortyTwenty
        ? 'VO2 40/20'
        : canUseMicroIntervalProgressions
        ? 'VO2 30/15 Micro Intervals'
        : 'VO2 Microbursts'

      return {
        summary: `${workoutName} ${sets} sets`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' with 3x1' build efforts`,
          `${sets} sets: ${repsPerSet}x${workSeconds}'' at ${workTarget} / ${floatSeconds}'' at ${floatTarget}`,
          `Set recovery ${setRecoveryMinutes}' easy spin`,
          canUseMicroIntervalProgressions
            ? 'Aim to keep each hard rep above 90% VO2max demand by maintaining repeatable power and cadence'
            : 'Keep power repeatable across all reps and avoid fading in the last set',
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 2) {
      const longRepMinutes = progressionLevel >= 7 ? 4 : 3
      return {
        summary: `VO2 Long Repeats ${reps}x${longRepMinutes}'`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive`,
          `${reps}x${longRepMinutes}' at ${powerOrHr({ minPct: 1.08, maxPct: 1.16 })}`,
          `Recovery ${longRepMinutes}' easy between reps`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    const workMinutes = progressionLevel >= 6 ? 4 : 3
    return {
      summary: `VO2Max ${reps}x${workMinutes}'`,
      workoutLevel,
      steps: [
        `Warm-up ${defaultWarmup}' with 3x1' build efforts`,
        `${reps}x${workMinutes}' at ${powerOrHr({ minPct: 1.08, maxPct: 1.18 })}`,
        `Recovery ${workMinutes}' easy between efforts`,
        `Cool-down ${defaultCooldown}' easy spin`,
      ],
    }
  }

  if (type === 'anaerobic') {
    const reps = clamp(6, 14, 8 + progressionLevel)

    if (safeVariant === 1) {
      return {
        summary: `Anaerobic 30/30 x${reps}`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive`,
          `${reps}x30'' at ${powerOrHr({ minPct: 1.3, maxPct: 1.5 })} / 30'' easy`,
          `Recovery 4' easy spin after every 6 reps`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 3) {
      const sprintReps = clamp(8, 16, 8 + progressionLevel)
      return {
        summary: `Anaerobic Sprints ${sprintReps}x15''`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive + 4x8'' openers`,
          `${sprintReps}x15'' all-out seated/standing sprint at ${powerOrHr({ minPct: 1.45, maxPct: 1.8 })}`,
          `Recovery 2'45'' easy spin between sprints`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 4) {
      const sets = clamp(3, 5, 3 + Math.floor(progressionLevel / 4))
      return {
        summary: `Race Acceleration Power ${sets} sets`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' progressive + 3x30'' build efforts`,
          `${sets} sets: 3' at ${powerOrHr({ minPct: 0.95, maxPct: 1.03 })} → 1' surge at ${powerOrHr({ minPct: 1.3, maxPct: 1.5 })} → 2' float at ${powerOrHr({ minPct: 0.72, maxPct: 0.82 })}`,
          `Set recovery 5' easy spin — aerobic and anaerobic systems both need partial reset`,
          `Cool-down ${defaultCooldown}' easy spin`,
          `Trains lactate clearance under load, repeated sprint capacity, and power sustainability — mirrors race attacks and recoveries`,
        ],
      }
    }

    const onMinutes = safeVariant === 2 ? 2 : 1
    const recoverMinutes = onMinutes === 2 ? 3 : 2
    return {
      summary: `Anaerobic ${reps}x${onMinutes}'`,
      workoutLevel,
      steps: [
        `Warm-up ${defaultWarmup}' progressive`,
        `${reps}x${onMinutes}' at ${powerOrHr({ minPct: 1.2, maxPct: 1.45 })}`,
        `Recovery ${recoverMinutes}' easy between reps`,
        `Cool-down ${defaultCooldown}' easy spin`,
      ],
    }
  }

  if (type === 'tempo') {
    const blocks = durationMinutes >= 70 ? clamp(2, 4, 2 + Math.floor(progressionLevel / 4)) : 1
    const blockDuration = Math.min(35, Math.max(12, Math.round((durationMinutes - defaultWarmup - defaultCooldown - (blocks - 1) * 6) / blocks)))

    if (safeVariant === 1) {
      return {
        summary: `Tempo Cadence Blocks ${blocks}x${blockDuration}'`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy`,
          `${blocks}x${blockDuration}' alternating 4' at 85-90 rpm + 4' at 95-100 rpm, power ${powerOrHr({ minPct: 0.8, maxPct: 0.88 })}`,
          blocks > 1 ? `Recovery 5' easy between blocks` : 'Steady pacing throughout',
          `Cool-down ${defaultCooldown}' easy`,
        ],
      }
    }

    if (safeVariant === 3) {
      return {
        summary: `Tempo Low-Cadence Torque ${blocks}x${blockDuration}'`,
        workoutLevel,
        steps: [
          `Warm-up ${defaultWarmup}' easy spin`,
          `${blocks}x${blockDuration}' at ${powerOrHr({ minPct: 0.82, maxPct: 0.9 })} with cadence 60-70 rpm, seated, stable core`,
          blocks > 1 ? `Recovery 6' easy spin at 90+ rpm between blocks` : 'Maintain smooth pedal stroke under load',
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    return {
      summary: `Tempo ${blocks}x${blockDuration}'`,
      workoutLevel,
      steps: [
        `Warm-up ${defaultWarmup}' easy`,
        `${blocks}x${blockDuration}' at ${powerOrHr({ minPct: 0.82, maxPct: 0.9 })}`,
        blocks > 1 ? `Recovery 6' easy between blocks` : 'Steady pacing throughout',
        `Cool-down ${defaultCooldown}' easy`,
      ],
    }
  }

  if (type === 'endurance') {
    const includeTempoInsert = (phase === 'build' || phase === 'peak') && durationMinutes >= 90 && safeVariant !== 0
    const mainBlock = Math.max(25, durationMinutes - defaultWarmup - defaultCooldown)

    if (safeVariant === 1 && durationMinutes >= 80) {
      return {
        summary: `${phase.toUpperCase()} Endurance + Low-Cadence`,
        workoutLevel,
        steps: [
          `Main block ${mainBlock}' at ${powerOrHr({ minPct: 0.62, maxPct: 0.75 })}`,
          `Insert 4x6' low-cadence torque at 60-70 rpm and ${powerOrHr({ minPct: 0.72, maxPct: 0.82 })}, recovery 3' easy spin`,
          `Finish with 3x10'' high-cadence spin-ups (100-110 rpm)`,
          `Fuel: 40-70g carbs/hour for rides > 90 minutes`,
        ],
      }
    }

    if (safeVariant === 2 && durationMinutes >= 90) {
      return {
        summary: `${phase.toUpperCase()} Endurance with Surges`,
        workoutLevel,
        steps: [
          `Main block ${mainBlock}' at ${powerOrHr({ minPct: 0.62, maxPct: 0.75 })}`,
          `Every 12' add 45'' at ${powerOrHr({ minPct: 0.92, maxPct: 1.0 })}, return immediately to Zone 2`,
          `Fuel: 50-80g carbs/hour for rides > 120 minutes`,
          `Cool-down ${defaultCooldown}' easy spin`,
        ],
      }
    }

    if (safeVariant === 3) {
      return {
        summary: `${phase.toUpperCase()} Split Endurance`,
        workoutLevel,
        steps: [
          `Block 1 ${Math.round(mainBlock * 0.55)}' at ${powerOrHr({ minPct: 0.62, maxPct: 0.72 })}`,
          `5' very easy spin and fueling reset`,
          `Block 2 ${Math.round(mainBlock * 0.45)}' at ${powerOrHr({ minPct: 0.68, maxPct: 0.76 })}`,
          `Include 3x10'' high-cadence spin-ups in final 30 minutes`,
        ],
      }
    }

    return {
      summary: `${phase.toUpperCase()} Endurance Ride`,
      workoutLevel,
      steps: [
        `Main block ${mainBlock}' at ${powerOrHr({ minPct: 0.62, maxPct: 0.75 })}`,
        includeTempoInsert
          ? `Insert 2x12' at ${powerOrHr({ minPct: 0.82, maxPct: 0.88 })} with 6' easy between blocks`
          : `Keep most time in Zone 2 with smooth cadence and aerobic focus`,
        `Include 3x8'' high-cadence spin-ups every 20 minutes`,
        `Fuel: 40-70g carbs/hour for rides > 90 minutes`,
      ],
    }
  }

  if (type === 'strength') {
    if (injuryConstraints.hasKneeIssues) {
      const controlSets = durationMinutes >= 55 ? 4 : 3
      return {
        summary: `Strength Knee-Friendly Stability ${controlSets} sets`,
        workoutLevel: Number(Math.max(1, workoutLevel - 0.8).toFixed(1)),
        steps: [
          `Warm-up 10': gentle spin or walk + hip/glute activation + ankle mobility`,
          `A1 Box squat to pain-free depth ${controlSets}x8 (slow 3'' eccentric, light-moderate load)`,
          `A2 Romanian deadlift ${controlSets}x8 @ RPE 6-7 with neutral spine`,
          `B1 Glute bridge or hip thrust ${controlSets}x10`,
          `B2 Split-stance isometric hold ${controlSets}x20-30''/side`,
          `C Core: dead bug ${controlSets}x8/side + side plank ${controlSets}x30-40''/side`,
          `Pain rule: keep discomfort <= 3/10, avoid deep knee flexion and plyometrics this block`,
        ],
      }
    }

    if (injuryConstraints.hasLowerBackIssues) {
      const controlSets = durationMinutes >= 55 ? 4 : 3
      return {
        summary: `Strength Spine-Safe Core + Legs ${controlSets} sets`,
        workoutLevel: Number(Math.max(1, workoutLevel - 0.7).toFixed(1)),
        steps: [
          `Warm-up 10': cat-camel, hip mobility, glute activation, diaphragmatic breathing`,
          `A1 Goblet squat ${controlSets}x8 @ RPE 6-7`,
          `A2 Supported single-leg Romanian deadlift ${controlSets}x8/side light load`,
          `B1 Step-up ${controlSets}x8/side controlled tempo`,
          `B2 Chest-supported row or band row ${controlSets}x10`,
          `C Core anti-rotation: Pallof press ${controlSets}x10/side + side plank ${controlSets}x30''/side`,
          `Keep neutral spine and stop if back pain rises during or after the set`,
        ],
      }
    }

    const normalizedBodyWeight = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : 70
    const roundToNearest2_5 = (value: number): number => Math.round(value / 2.5) * 2.5
    const formatLoad = (min: number, max: number): string => `${roundToNearest2_5(min)}-${roundToNearest2_5(max)}kg`
    const strengthLevel = clamp(1, 10, progressionLevel + (phase === 'build' ? 1 : 0))
    const sets = durationMinutes >= 55 ? clamp(3, 5, 3 + Math.floor(strengthLevel / 4)) : 3
    const repTarget = phase === 'peak' ? 6 : phase === 'build' ? 8 : 10
    const loadFactor = 0.9 + strengthLevel * 0.03
    const squatLoad = formatLoad(normalizedBodyWeight * 0.25 * loadFactor, normalizedBodyWeight * 0.4 * loadFactor)
    const hingeLoad = formatLoad(normalizedBodyWeight * 0.2 * loadFactor, normalizedBodyWeight * 0.35 * loadFactor)
    const rowLoad = formatLoad(normalizedBodyWeight * 0.15 * loadFactor, normalizedBodyWeight * 0.3 * loadFactor)
    const hasDumbbells = equipment.includes('dumbbells')
    const hasBands = equipment.includes('resistance_bands')
    const hasRower = equipment.includes('rowing_machine')

    if (hasDumbbells) {
      if (safeVariant === 1) {
        return {
          summary: `Strength Posterior Chain ${sets} sets`,
          workoutLevel,
          steps: [
            `Warm-up 8': glute bridge 2x10, bird dog 2x8/side, squat patterning`,
            `A1 Romanian deadlift ${sets}x${repTarget} @ ${hingeLoad}`,
            `A2 Bulgarian split squat ${sets}x${Math.max(6, repTarget - 2)}/side @ ${squatLoad}`,
            `B1 One-arm row ${sets}x${repTarget + 2}/side @ ${rowLoad}`,
            `B2 Push-up/floor press ${sets}x${repTarget} @ RPE 7-8`,
            `Progression: add 2.5kg or 1 rep each build week; deload every 4th week`,
          ],
        }
      }

      if (safeVariant === 2) {
        const maxStrengthReps = 4 + Math.max(0, Math.floor((10 - strengthLevel) / 3))
        return {
          summary: `Strength Max Force ${sets} sets`,
          workoutLevel,
          steps: [
            `Warm-up 10': mobility + activation + 2 ramp-up sets per lift`,
            `A1 Goblet/front-loaded squat ${sets}x${maxStrengthReps} @ ${squatLoad} (RPE 8-9)`,
            `A2 Romanian deadlift ${sets}x${maxStrengthReps} @ ${hingeLoad}`,
            `B1 One-arm row ${sets}x${maxStrengthReps + 2}/side @ ${rowLoad}`,
            `B2 Push press or floor press ${sets}x${maxStrengthReps + 1} @ RPE 8`,
            `Rest 2-3' between heavy sets; prioritize movement quality over fatigue`,
          ],
        }
      }

      if (safeVariant === 3) {
        return {
          summary: `Strength Power + Conditioning ${sets} sets`,
          workoutLevel,
          steps: [
            `Warm-up 8': dynamic mobility + jump prep`,
            `A1 Jump squat ${sets}x6 bodyweight`,
            `A2 Dumbbell thruster ${sets}x8 @ ${squatLoad}`,
            `B1 Alternating reverse lunge ${sets}x8/side @ ${rowLoad}`,
            `B2 Renegade row ${sets}x8/side @ ${rowLoad}`,
            `Finisher: 6x20'' hard / 70'' easy (bike or rower if available)`,
          ],
        }
      }

      return {
        summary: `Strength ${sets} sets (load guided)`,
        workoutLevel,
        steps: [
          `Warm-up 8': glute bridge 2x10, dead bug 2x8/side, bodyweight squat 2x10`,
          `A1 Goblet squat ${sets}x${repTarget} @ ${squatLoad} (RPE 7-8, 2 reps in reserve)`,
          `A2 Romanian deadlift ${sets}x${repTarget} @ ${hingeLoad} (controlled 3s eccentric)`,
          `B1 One-arm dumbbell row ${sets}x${repTarget + 2}/side @ ${rowLoad}`,
          `B2 Push-up or dumbbell floor press ${sets}x${Math.max(6, repTarget - 1)}-${repTarget + 2} @ RPE 7`,
          `C Core: side plank ${sets}x35-45''/side`,
          `Rest 75-90'' between sets; increase load 2.5kg when all reps are completed with good form`,
        ],
      }
    }

    if (hasBands) {
      if (safeVariant === 3) {
        return {
          summary: `Strength Band Power ${sets} sets`,
          workoutLevel,
          steps: [
            `Warm-up 8': hip/ankle mobility + activation`,
            `A1 Banded squat-to-press ${sets}x10`,
            `A2 Explosive banded row ${sets}x10`,
            `B1 Split squat ${sets}x8/side with slow eccentric (3s down)`,
            `B2 Banded dead bug pull ${sets}x10/side`,
            `Progression: add band tension only when speed and form remain clean`,
          ],
        }
      }

      return {
        summary: `Strength ${sets} sets (band progression)`,
        workoutLevel,
        steps: [
          `Warm-up 8': hip mobility + activation`,
          `A1 Banded squat ${sets}x12 (medium/heavy band, RPE 7)`,
          `A2 Banded hinge ${sets}x10 (3s lowering)`,
          `B1 Banded row ${sets}x12`,
          `B2 Banded overhead press ${sets}x10`,
          `C Split squat ${sets}x10/side bodyweight or with band assistance`,
          `Progression: reduce assistance or move to thicker band once all reps are clean`,
        ],
      }
    }

    if (hasRower) {
      return {
        summary: 'Strength Endurance + Rower Power',
        workoutLevel,
        steps: [
          `Circuit 3 rounds: split squat 10/side, hinge 12, push-up 10, plank 40''`,
          `Rower block: 6x2' @ ${rowerTarget({ minPct: 0.86, maxPct: 0.96, cadenceMin: 24, cadenceMax: 28 })}`,
          `Recovery 2' easy row @ 18-20 spm between reps`,
          `Cool-down 8' mobility and breathing`,
        ],
      }
    }

    return {
      summary: 'Bodyweight Strength Session',
      workoutLevel,
      steps: [
        `Warm-up 8': activation + mobility`,
        `4x10 squat, 4x8 reverse lunge/side, 4x10 hip hinge, 4x10 push-up`,
        `Core 3x40'' plank + 3x10 dead bug/side`,
        `Cool-down 8': hip flexor + thoracic mobility`,
      ],
    }
  }

  return {
    summary: 'Recovery Spin',
    workoutLevel,
    steps: [
      `Easy spin ${Math.max(20, durationMinutes - 5)}' at ${powerOrHr({ minPct: 0.5, maxPct: 0.6 })}`,
      `Optional: 5' breathing and light mobility post-ride`,
    ],
  }
}

function getPreferredVo2MicroInterval(goal: UserProfile['goal']): '30/15' | '40/20' | 'mixed' {
  if (goal === 'ftp_increase') {
    return '30/15'
  }

  if (goal === 'climbing_sustainability') {
    return '40/20'
  }

  if (goal === 'endurance') {
    return 'mixed'
  }

  return 'mixed'
}

function getFortyTwentyRepsForWeek(weekNumber: number, phase: TrainingPhase): number {
  const blockWeek = getTrainingBlockWeek(weekNumber)

  if (phase === 'build') {
    const progressionByBuildWeek: Record<number, number> = {
      1: 6,
      2: 7,
      3: 8,
      4: 6,
    }
    return progressionByBuildWeek[blockWeek] || 6
  }

  if (phase === 'peak') {
    const progressionByPeakWeek: Record<number, number> = {
      1: 8,
      2: 9,
      3: 10,
      4: 7,
    }
    return progressionByPeakWeek[blockWeek] || 8
  }

  return 6
}

function getThirtyFifteenSetsForWeek(weekNumber: number, phase: TrainingPhase): number {
  const blockWeek = getTrainingBlockWeek(weekNumber)

  if (phase === 'peak') {
    const progressionByPeakWeek: Record<number, number> = {
      1: 2,
      2: 3,
      3: 3,
      4: 2,
    }
    return progressionByPeakWeek[blockWeek] || 2
  }

  if (phase === 'build') {
    return blockWeek >= 3 ? 2 : 1
  }

  return 1
}

function shouldForceThirtyFifteenSession(weekNumber: number, phase: TrainingPhase): boolean {
  if (phase !== 'build' && phase !== 'peak') {
    return false
  }

  // Ensure at least one explicit 30/15 micro-interval VO2 prescription every two weeks.
  return weekNumber % 2 === 1
}

type ApplyWeeklyLoadBudgetOptions = {
  sessions: TrainingSession[]
  phase: TrainingPhase
  weekNumber: number
  previousWeekLoadScore?: number
}

function applyWeeklyLoadBudget({ sessions, phase, weekNumber, previousWeekLoadScore }: ApplyWeeklyLoadBudgetOptions): TrainingSession[] {
  if (!previousWeekLoadScore || previousWeekLoadScore <= 0 || sessions.length === 0) {
    return sessions
  }

  const weekInBlock = getTrainingBlockWeek(weekNumber)
  const baselineRamp = phase === 'recovery' ? 0.8 : weekInBlock === 4 ? 0.85 : 1.08
  const maxTargetLoad = previousWeekLoadScore * baselineRamp
  let currentLoad = calculateWeekLoadScore(sessions)

  if (currentLoad <= maxTargetLoad) {
    return sessions
  }

  const reduced = sessions.map((session) => ({ ...session }))
  const adjustableOrder: SessionType[] = ['recovery', 'strength', 'tempo', 'anaerobic', 'threshold', 'vo2max', 'endurance']

  for (const sessionType of adjustableOrder) {
    for (const session of reduced) {
      if (currentLoad <= maxTargetLoad) {
        break
      }

      if (session.type !== sessionType || session.duration <= 25) {
        continue
      }

      const step = session.type === 'endurance' ? 10 : 5
      const minDuration = session.type === 'endurance' ? 60 : 25
      const nextDuration = Math.max(minDuration, session.duration - step)
      if (nextDuration === session.duration) {
        continue
      }

      const previousContribution = getSessionLoadContribution(session)
      session.duration = nextDuration
      const newContribution = getSessionLoadContribution(session)
      currentLoad = currentLoad - previousContribution + newContribution
    }
  }

  return reduced
}

function calculateWeekLoadScore(sessions: TrainingSession[]): number {
  return sessions.reduce((sum, session) => sum + getSessionLoadContribution(session), 0)
}

function getSessionLoadContribution(session: TrainingSession): number {
  const factorByType: Record<SessionType, number> = {
    recovery: 0.45,
    endurance: 0.75,
    tempo: 0.95,
    threshold: 1.1,
    vo2max: 1.2,
    anaerobic: 1.25,
    strength: 0.85,
  }

  return session.duration * factorByType[session.type]
}

function calculatePlannedPower(
  type: SessionType,
  profile: UserProfile,
  intensityScale: number,
  phase: TrainingPhase,
  weekNumber: number,
  totalWeeks: number
): number | undefined {
  const ftp = profile.ftp || 200 // default estimate
  const targetRanges: Record<SessionType, [number, number]> = {
    recovery: [0.5, 0.58],
    endurance: [0.62, 0.75],
    tempo: [0.8, 0.9],
    threshold: [0.93, 1.0],
    vo2max: [1.08, 1.18],
    anaerobic: [1.2, 1.45],
    strength: [0, 0],
  }
  const [low, high] = targetRanges[type]
  const progression = getWeekProgression(weekNumber, totalWeeks)
  const phaseOffset = phase === 'recovery' ? -0.05 : phase === 'peak' ? 0.02 : 0
  const percentage = clamp(0.45, 1.6, (low + (high - low) * progression + phaseOffset) * intensityScale)
  return percentage > 0 ? Math.round(ftp * percentage) : undefined
}

function calculatePlannedHeartRate(
  type: SessionType,
  profile: UserProfile,
  intensityScale: number,
  phase: TrainingPhase,
  weekNumber: number,
  totalWeeks: number
) {
  const maxHR = profile.maxHeartRate || 200
  const progression = getWeekProgression(weekNumber, totalWeeks)
  const phaseOffset = phase === 'recovery' ? -0.04 : phase === 'peak' ? 0.02 : 0
  const rangeMap: Record<SessionType, [number, number]> = {
    recovery: [0.5, 0.6],
    endurance: [0.6, 0.75],
    tempo: [0.75, 0.85],
    threshold: [0.85, 0.92],
    vo2max: [0.92, 0.98],
    anaerobic: [0.95, 1.0],
    strength: [0.6, 0.75],
  }
  const [minPct, maxPct] = rangeMap[type]
  const scaledMin = clamp(0.45, 1, (minPct + progression * 0.03 + phaseOffset) * intensityScale)
  const scaledMax = clamp(0.5, 1.05, (maxPct + progression * 0.03 + phaseOffset) * intensityScale)

  return {
    min: Math.round(maxHR * Math.min(scaledMin, scaledMax - 0.02)),
    max: Math.round(maxHR * Math.max(scaledMax, scaledMin + 0.02)),
  }
}

function applyMicrocycleVariation(
  templates: SessionTemplate[],
  weekNumber: number,
  totalWeeks: number,
  phase: TrainingPhase
): SessionTemplate[] {
  const adjusted = templates.map((template) => ({ ...template }))
  const weekInBlock = ((weekNumber - 1) % 4) + 1

  if (weekInBlock === 4 && phase !== 'recovery') {
    replaceFirstSessionType(adjusted, ['anaerobic', 'vo2max'], 'tempo')
    return adjusted.map((template) => ({
      ...template,
      duration: template.type === 'recovery' ? template.duration : Math.max(30, Math.round(template.duration * 0.82)),
    }))
  }

  if (weekInBlock === 3 && (phase === 'build' || phase === 'peak')) {
    return adjusted.map((template) => {
      if (template.type === 'endurance') {
        return { ...template, duration: Math.min(210, Math.round(template.duration * 1.12)) }
      }

      if (template.type === 'threshold' || template.type === 'tempo') {
        return { ...template, duration: Math.min(120, template.duration + 5) }
      }

      return template
    })
  }

  if (weekNumber === totalWeeks && phase === 'recovery') {
    return adjusted.map((template) => ({
      ...template,
      duration: template.type === 'recovery' ? template.duration : Math.max(30, Math.round(template.duration * 0.9)),
    }))
  }

  return adjusted
}

function buildInjuryConstraints(injuries: UserProfile['injuries'] = []): InjuryConstraints {
  const normalized = injuries.filter((injury) => injury !== 'none')

  return {
    hasKneeIssues: normalized.includes('knee'),
    hasLowerBackIssues: normalized.includes('lower_back'),
    hasShoulderIssues: normalized.includes('shoulder'),
    hasAny: normalized.length > 0,
  }
}

function getInjuryIntensityScale(injuryConstraints: InjuryConstraints): number {
  if (injuryConstraints.hasKneeIssues || injuryConstraints.hasLowerBackIssues) {
    return 0.94
  }

  if (injuryConstraints.hasShoulderIssues) {
    return 0.97
  }

  return 1
}

function applyInjuryDurationAdjustment(
  durationMinutes: number,
  sessionType: SessionType,
  injuryConstraints: InjuryConstraints
): number {
  if (!injuryConstraints.hasAny) {
    return durationMinutes
  }

  const reduction =
    (injuryConstraints.hasKneeIssues || injuryConstraints.hasLowerBackIssues) &&
    (sessionType === 'threshold' || sessionType === 'vo2max' || sessionType === 'anaerobic')
      ? 0.9
      : 1

  return Math.max(20, Math.round((durationMinutes * reduction) / 5) * 5)
}

function applyInjuryConstraintsToSessionTemplates(
  templates: SessionTemplate[],
  injuryConstraints: InjuryConstraints,
  phase: TrainingPhase
): SessionTemplate[] {
  if (!injuryConstraints.hasAny) {
    return templates
  }

  const adjusted = templates.map((template) => ({ ...template }))

  if (injuryConstraints.hasKneeIssues) {
    for (const template of adjusted) {
      if (template.type === 'anaerobic') {
        template.type = 'tempo'
      } else if (template.type === 'vo2max' && phase !== 'peak') {
        template.type = 'threshold'
      }
    }
  }

  if (injuryConstraints.hasLowerBackIssues) {
    replaceFirstSessionType(adjusted, ['anaerobic'], 'tempo')
  }

  return adjusted
}

function applyHardSessionSpacingGuardrails(
  templates: SessionTemplate[],
  phase: TrainingPhase,
  intensityDistribution: UserProfile['intensityDistribution']
): SessionTemplate[] {
  const adjusted = templates.map((template) => ({ ...template }))
  const hardTypes: SessionType[] = ['threshold', 'vo2max', 'anaerobic']
  const preferredSwapTypes: SessionType[] = ['recovery', 'endurance', 'tempo']
  const distribution = intensityDistribution || 'conservative'
  const minimumDayGap = distribution === 'aggressive' ? (phase === 'peak' ? 1 : 2) : phase === 'peak' ? 2 : 3

  for (let index = 1; index < adjusted.length; index++) {
    const current = adjusted[index]
    if (!hardTypes.includes(current.type)) {
      continue
    }

    const previousHard = adjusted
      .slice(0, index)
      .reverse()
      .find((template) => hardTypes.includes(template.type))

    if (!previousHard || current.day - previousHard.day >= minimumDayGap) {
      continue
    }

    const swapCandidate = adjusted
      .filter((template) => template.day > previousHard.day && preferredSwapTypes.includes(template.type))
      .sort((a, b) => {
        const aMeetsGap = a.day - previousHard.day >= minimumDayGap ? 0 : 1
        const bMeetsGap = b.day - previousHard.day >= minimumDayGap ? 0 : 1

        if (aMeetsGap !== bMeetsGap) {
          return aMeetsGap - bMeetsGap
        }

        return b.day - a.day
      })[0]

    if (swapCandidate) {
      const swapDay = swapCandidate.day
      swapCandidate.day = current.day
      current.day = swapDay
      continue
    }

    if (distribution === 'conservative') {
      // Fall back to a sub-threshold day when spacing cannot be safely created.
      current.type = 'tempo'
      current.duration = Math.max(45, Math.round(current.duration * 0.85))
    }
  }

  return adjusted.sort((a, b) => a.day - b.day)
}

function applyAthleteSignatureToSessionTemplates(
  templates: SessionTemplate[],
  phase: TrainingPhase,
  goal: UserProfile['goal'],
  athleteSignature?: AthleteRideSignature
): SessionTemplate[] {
  if (!athleteSignature || goal === 'recovery') {
    return templates
  }

  const adjusted = templates.map((template) => ({ ...template }))
  const thresholdWeak =
    athleteSignature.sustainedPowerFraction < 0.9 || athleteSignature.powerDurationProfile.thresholdPowerFraction < 0.94
  const enduranceWeak =
    athleteSignature.enduranceDecouplingScore < 0.94 ||
    athleteSignature.powerDurationProfile.longEndurancePowerFraction < 0.66 ||
    athleteSignature.fatigueResistanceScore < 0.82
  const vo2Weak = athleteSignature.powerDurationProfile.vo2PowerFraction < 1.03
  const sprintWeak = athleteSignature.powerDurationProfile.shortPowerFraction < 1.45
  const climbingWeak =
    athleteSignature.climbingProfile.sustainedUphillPowerFraction < 0.93 ||
    athleteSignature.climbingProfile.climbingTrendScore < 0.98

  if (phase === 'base') {
    if (enduranceWeak) {
      replaceFirstSessionType(adjusted, ['tempo'], 'endurance')
      setTemplateDuration(adjusted, 'endurance', 1, 105)
    }

    if (thresholdWeak) {
      replaceFirstSessionType(adjusted, ['strength'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 1, 70)
    }

    return adjusted
  }

  if (phase === 'build') {
    if (goal === 'climbing_sustainability' && climbingWeak) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 2, 85)
    }

    if (thresholdWeak) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 2, 80)
    } else if (vo2Weak && athleteSignature.highIntensityDensityScore < 0.95) {
      replaceFirstSessionType(adjusted, ['strength'], 'vo2max')
      setTemplateDuration(adjusted, 'vo2max', 2, 60)
    }

    if (enduranceWeak) {
      replaceFirstSessionType(adjusted, ['recovery'], 'endurance')
      setTemplateDuration(adjusted, 'endurance', 2, 90)
    }

    return adjusted
  }

  if (phase === 'peak') {
    if (goal === 'climbing_sustainability' && climbingWeak) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 2, 80)
      if (enduranceWeak) {
        replaceFirstSessionType(adjusted, ['recovery'], 'endurance')
        setTemplateDuration(adjusted, 'endurance', 2, 95)
      }
      return adjusted
    }

    if (thresholdWeak) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 2, 75)
    } else if (vo2Weak && athleteSignature.highIntensityDensityScore < 0.95) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'vo2max')
      setTemplateDuration(adjusted, 'vo2max', 2, 60)
    } else if (sprintWeak) {
      replaceFirstSessionType(adjusted, ['anaerobic'], 'threshold')
      setTemplateDuration(adjusted, 'threshold', 2, 75)
    }

    if (enduranceWeak) {
      replaceFirstSessionType(adjusted, ['recovery'], 'endurance')
      setTemplateDuration(adjusted, 'endurance', 2, 85)
    }
  }

  return adjusted
}

function setTemplateDuration(templates: SessionTemplate[], type: SessionType, occurrence: number, duration: number): void {
  let seen = 0

  for (const template of templates) {
    if (template.type !== type) {
      continue
    }

    seen += 1
    if (seen === occurrence) {
      template.duration = Math.max(template.duration, duration)
      return
    }
  }
}

function getInjurySafeWorkoutVariant(type: SessionType, baseVariant: number, injuryConstraints: InjuryConstraints): number {
  if (!injuryConstraints.hasAny) {
    return baseVariant
  }

  if (type === 'anaerobic' && (injuryConstraints.hasKneeIssues || injuryConstraints.hasLowerBackIssues)) {
    // Avoid sprint-focused and race-simulation variants while injured.
    return baseVariant === 3 || baseVariant === 4 ? 1 : baseVariant
  }

  if ((type === 'tempo' || type === 'endurance') && (injuryConstraints.hasKneeIssues || injuryConstraints.hasLowerBackIssues)) {
    // Avoid low-cadence torque variants that can increase joint/back load.
    return baseVariant === 3 ? 0 : baseVariant
  }

  return baseVariant
}

function addInjuryFocusPoints(focusPoints: string[], injuryConstraints: InjuryConstraints): string[] {
  if (!injuryConstraints.hasAny) {
    return focusPoints
  }

  const additions: string[] = []

  if (injuryConstraints.hasKneeIssues) {
    additions.push('Knee-friendly progression and load management')
  }

  if (injuryConstraints.hasLowerBackIssues) {
    additions.push('Spine-safe training and core stability')
  }

  if (injuryConstraints.hasShoulderIssues) {
    additions.push('Shoulder-friendly movement quality')
  }

  const uniqueFocus = [...focusPoints]
  for (const item of additions) {
    if (!uniqueFocus.includes(item)) {
      uniqueFocus.push(item)
    }
  }

  return uniqueFocus
}

function getWeekProgression(weekNumber: number, totalWeeks: number): number {
  if (totalWeeks <= 1) {
    return 0.5
  }

  return clamp(0, 1, (weekNumber - 1) / (totalWeeks - 1))
}

function getTrainingBlockWeek(weekNumber: number): number {
  return ((weekNumber - 1) % 4) + 1
}

function getWorkoutVariantIndex(type: SessionType, weekNumber: number, dayOfWeek: number, variantCount: number): number {
  const typeHash = [...type].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return (typeHash + weekNumber * 7 + dayOfWeek * 13) % variantCount
}

function getAthleteSignatureWorkoutVariant(
  type: SessionType,
  baseVariant: number,
  phase: TrainingPhase,
  athleteSignature?: AthleteRideSignature
): number {
  if (!athleteSignature) {
    return baseVariant
  }

  if (type === 'threshold') {
    if (
      athleteSignature.climbingProfile.sustainedUphillPowerFraction < 0.93 ||
      athleteSignature.climbingProfile.climbingTrendScore < 0.98
    ) {
      return phase === 'peak' ? 4 : 2
    }

    if (athleteSignature.sustainedPowerFraction < 0.9) {
      return phase === 'peak' ? 4 : 2
    }

    if (athleteSignature.powerDurationProfile.thresholdPowerFraction < 0.93) {
      return 2
    }

    if (athleteSignature.fatigueResistanceScore < 0.82) {
      return 1
    }

    if (athleteSignature.highIntensityDensityScore > 1.05) {
      return 3
    }
  }

  if (type === 'vo2max') {
    if (athleteSignature.highIntensityDensityScore < 0.95) {
      return 1
    }

    if (athleteSignature.powerDurationProfile.vo2PowerFraction < 1.03) {
      return 1
    }

    if (athleteSignature.sustainedPowerFraction > 0.97 && athleteSignature.fatigueResistanceScore > 0.86) {
      return 2
    }
  }

  if (type === 'anaerobic') {
    if (athleteSignature.highIntensityDensityScore < 0.9) {
      return 1
    }

    if (athleteSignature.powerDurationProfile.shortPowerFraction < 1.45) {
      return 1
    }

    if (athleteSignature.highIntensityDensityScore > 1.05) {
      return 4
    }
  }

  if (type === 'tempo') {
    if (athleteSignature.aerobicEfficiencyScore < 0.95) {
      return 0
    }

    if (athleteSignature.sustainedPowerFraction < 0.92) {
      return 1
    }
  }

  if (type === 'endurance') {
    if (
      athleteSignature.climbingProfile.sustainedUphillPowerFraction < 0.93 ||
      athleteSignature.climbingProfile.climbingTrendScore < 0.98
    ) {
      return 1
    }

    if (
      athleteSignature.aerobicEfficiencyScore < 0.95 ||
      athleteSignature.fatigueResistanceScore < 0.82 ||
      athleteSignature.enduranceDecouplingScore < 0.94
    ) {
      return 3
    }

    if (athleteSignature.aerobicEfficiencyScore > 1.05 && athleteSignature.fatigueResistanceScore > 0.88) {
      return 2
    }
  }

  return baseVariant
}

function getSessionProgressionLevel(type: SessionType, phase: TrainingPhase, weekNumber: number, totalWeeks: number): number {
  const progression = getWeekProgression(weekNumber, totalWeeks)
  const blockWeek = getTrainingBlockWeek(weekNumber)
  const phaseBias: Record<TrainingPhase, number> = {
    base: 0,
    build: 1,
    peak: 2,
    recovery: -2,
  }
  const typeBias: Record<SessionType, number> = {
    recovery: -2,
    endurance: 0,
    tempo: 1,
    threshold: 2,
    vo2max: 2,
    anaerobic: 2,
    strength: 1,
  }
  const deloadOffset = blockWeek === 4 ? -2 : blockWeek === 3 ? 1 : 0
  const rawLevel = 3 + progression * 5 + phaseBias[phase] + typeBias[type] + deloadOffset

  return Math.round(clamp(1, 10, rawLevel))
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

type ApplyIntervalsInsightsToSessionTemplatesOptions = {
  templates: SessionTemplate[]
  insights?: IntervalsTrainingInsights
  phase: TrainingPhase
}

function applyIntervalsInsightsToSessionTemplates({
  templates,
  insights,
  phase,
}: ApplyIntervalsInsightsToSessionTemplatesOptions): SessionTemplate[] {
  if (!insights?.hasRecentData) {
    return templates
  }

  const adjusted = templates.map((template) => ({ ...template }))
  const isOverloaded =
    insights.loadRatio > 1.25 ||
    insights.avgIntensity > 75 ||
    insights.highIntensityShare > 0.35 ||
    insights.highPowerZoneShare > 0.22 ||
    insights.easyPowerZoneShare < 0.5
  const isUnderloaded =
    insights.loadRatio > 0 &&
    insights.loadRatio < 0.8 &&
    insights.highIntensityShare < 0.2 &&
    insights.highPowerZoneShare < 0.12 &&
    insights.easyPowerZoneShare > 0.7

  if (isOverloaded) {
    replaceFirstSessionType(adjusted, ['anaerobic', 'vo2max', 'threshold'], 'recovery')
    replaceFirstSessionType(adjusted, ['threshold', 'tempo'], 'endurance')
    return adjusted.map((template) => ({
      ...template,
      duration: template.type === 'recovery' ? template.duration : Math.max(30, Math.round(template.duration * 0.85)),
    }))
  }

  if (isUnderloaded && (phase === 'build' || phase === 'peak')) {
    replaceFirstSessionType(adjusted, ['recovery'], 'threshold')
    replaceFirstSessionType(adjusted, ['endurance'], 'tempo')

    return adjusted.map((template) => {
      if (template.type === 'endurance') {
        return {
          ...template,
          duration: Math.min(180, Math.round(template.duration * 1.1)),
        }
      }

      return template
    })
  }

  return adjusted
}

function replaceFirstSessionType(templates: SessionTemplate[], sourceTypes: SessionType[], targetType: SessionType): void {
  const targetTemplate = templates.find((template) => sourceTypes.includes(template.type))
  if (targetTemplate) {
    targetTemplate.type = targetType
  }
}

function getIntensityScale(insights?: IntervalsTrainingInsights): number {
  if (!insights?.hasRecentData) {
    return 1
  }

  if (
    insights.loadRatio > 1.25 ||
    insights.avgIntensity > 75 ||
    insights.highPowerZoneShare > 0.22 ||
    insights.easyPowerZoneShare < 0.5
  ) {
    return 0.95
  }

  if (
    insights.loadRatio > 0 &&
    insights.loadRatio < 0.8 &&
    insights.highIntensityShare < 0.2 &&
    insights.highPowerZoneShare < 0.12 &&
    insights.easyPowerZoneShare > 0.7
  ) {
    return 1.03
  }

  return 1
}

type AssessFtpIncreaseTargetOptions = {
  ftp?: number
  durationWeeks: number
  availableTime: UserProfile['availableTime']
  injuries: UserProfile['injuries']
  insights?: IntervalsTrainingInsights
}

export function assessFtpIncreaseTarget({
  ftp,
  durationWeeks,
  availableTime,
  injuries,
  insights,
}: AssessFtpIncreaseTargetOptions): number {
  const weeklyHours = Object.values(availableTime).reduce((sum, h) => sum + (h || 0), 0)

  // Base rate: realistic W/week for a structured training block given weekly hours.
  // Empirical ceiling: ~3-4W/week for well-trained riders at high volume; ~1-1.5W/week at low volume.
  const hoursRate = clamp(1, 4, weeklyHours * 0.35)

  // Duration factor: longer blocks allow more adaptation but with diminishing returns.
  const durationFactor = clamp(0.7, 1.3, 0.7 + (durationWeeks / 16) * 0.6)

  // Injury penalty: high-intensity sessions are reduced, limiting FTP stimulus.
  const normalizedInjuries = injuries.filter((i) => i !== 'none')
  const injuryPenalty = normalizedInjuries.length > 0 ? 0.75 : 1

  // Load ratio penalty: if athlete is already overloaded, target is conservative.
  let loadPenalty = 1
  if (insights?.hasRecentData) {
    if (insights.loadRatio > 1.25 || insights.avgIntensity > 75) {
      loadPenalty = 0.7
    } else if (insights.loadRatio < 0.7 && insights.easyPowerZoneShare > 0.75) {
      // Underloaded — athlete has more headroom.
      loadPenalty = 1.2
    }
  }

  // FTP ceiling: proportional gains are harder as FTP rises.
  // Above 300W the marginal gain per week shrinks.
  const ftpCeiling = ftp ? clamp(0.6, 1, 1 - Math.max(0, (ftp - 250) / 500)) : 1

  const rawIncrease = hoursRate * durationWeeks * durationFactor * injuryPenalty * loadPenalty * ftpCeiling

  // Round to nearest 5W, between 5W and 60W.
  return clamp(5, 60, Math.round(rawIncrease / 5) * 5)
}

export function calculateTargetMetrics(profile: Pick<UserProfile, 'ftp' | 'ftpIncreaseTargetWatts' | 'availableTime' | 'weight'>, durationWeeks: number) {
  const baseIncrease = profile.ftpIncreaseTargetWatts ?? durationWeeks * 2
  const weeklyAvailabilityHours = Object.values(profile.availableTime).reduce((sum, hours) => sum + (hours || 0), 0)

  return {
    ftpTarget: profile.ftp ? profile.ftp + baseIncrease : undefined,
    ftpIncreaseTargetWatts: baseIncrease,
    climbingWatts: profile.ftp ? Math.round(profile.ftp * 0.9) : undefined,
    climbingWattsPerKg: profile.ftp && profile.weight > 0 ? Number((profile.ftp / profile.weight).toFixed(2)) : undefined,
    enduranceHours: Math.round(durationWeeks * weeklyAvailabilityHours),
  }
}

function formatPlanStartDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
