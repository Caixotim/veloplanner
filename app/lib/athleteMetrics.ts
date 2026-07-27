import type { DailyLoadPoint, SessionType, TrainingPlan, TrainingPhase } from './types'

// ─── Freshness Score ──────────────────────────────────────────────────────────

export type FreshnessCategory = 'peak' | 'fresh' | 'neutral' | 'tired' | 'overreached'

export type FreshnessScore = {
  score: number                 // 0–100
  category: FreshnessCategory
  label: string
}

export function computeFreshnessScore(
  currentTsb: number,
  currentRamp7d: number,
  weeklyCompletionPct: number    // 0–100, from compliance
): FreshnessScore {
  // TSB contribution: +5 to -10 maps to 0–60 pts
  const tsbScore = Math.min(60, Math.max(0, (currentTsb + 10) / 15 * 60))

  // Ramp contribution: high ramp = low freshness, capped at 20 pts
  const rampPenalty = Math.min(20, Math.max(0, currentRamp7d / 8))
  const rampScore = 20 - rampPenalty

  // Compliance contribution: good adherence = athlete is doing the work = 20 pts
  const complianceScore = Math.min(20, weeklyCompletionPct / 5)

  const raw = Math.round(tsbScore + rampScore + complianceScore)
  const score = Math.min(100, Math.max(0, raw))

  const category: FreshnessCategory =
    score >= 82 ? 'peak' :
    score >= 65 ? 'fresh' :
    score >= 45 ? 'neutral' :
    score >= 25 ? 'tired' :
    'overreached'

  const label =
    category === 'peak' ? 'Peak Form' :
    category === 'fresh' ? 'Fresh' :
    category === 'neutral' ? 'Neutral' :
    category === 'tired' ? 'Tired' :
    'Overreached'

  return { score, category, label }
}

// ─── Weekly Planning Assistant ────────────────────────────────────────────────

export type SuggestedSessionSlot = {
  dayLabel: string
  sessionType: SessionType
  durationMin: number
  rationale: string
}

export type WeeklyPlanSuggestion = {
  headline: string
  slots: SuggestedSessionSlot[]
}

type WeeklyPlanInput = {
  freshnessCategory: FreshnessCategory
  currentPhase: TrainingPhase
  goal: TrainingPlan['goal']
  daysToNextAEvent: number       // -1 if no A event upcoming
  rampStatus: 'optimal' | 'caution' | 'overload' | 'deload'
}

export function computeWeeklyPlanSuggestion({
  freshnessCategory,
  currentPhase,
  goal,
  daysToNextAEvent,
  rampStatus,
}: WeeklyPlanInput): WeeklyPlanSuggestion {
  const isRaceWeek = daysToNextAEvent >= 0 && daysToNextAEvent <= 7
  const isSharpeningWeek = daysToNextAEvent >= 8 && daysToNextAEvent <= 14
  const isFatigued = freshnessCategory === 'tired' || freshnessCategory === 'overreached'
  const isFresh = freshnessCategory === 'peak' || freshnessCategory === 'fresh'

  if (rampStatus === 'overload' || freshnessCategory === 'overreached') {
    return {
      headline: 'Recovery week recommended — load has climbed too fast.',
      slots: [
        { dayLabel: 'Day 1', sessionType: 'recovery', durationMin: 45, rationale: 'Easy spin to flush fatigue' },
        { dayLabel: 'Day 2', sessionType: 'endurance', durationMin: 60, rationale: 'Low-zone aerobic maintenance' },
        { dayLabel: 'Day 3', sessionType: 'recovery', durationMin: 30, rationale: 'Active rest' },
        { dayLabel: 'Day 4', sessionType: 'endurance', durationMin: 75, rationale: 'Zone 2 only, no pressure' },
        { dayLabel: 'Day 5', sessionType: 'recovery', durationMin: 30, rationale: 'Rest or gentle movement' },
        { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 90, rationale: 'Longer easy ride if feeling better' },
        { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
      ],
    }
  }

  if (isRaceWeek) {
    return {
      headline: 'Race week — activate, do not build.',
      slots: [
        { dayLabel: 'Day 1', sessionType: 'endurance', durationMin: 60, rationale: 'Easy openers to stay loose' },
        { dayLabel: 'Day 2', sessionType: 'threshold', durationMin: 45, rationale: '1–2 short quality efforts to keep snap' },
        { dayLabel: 'Day 3', sessionType: 'recovery', durationMin: 30, rationale: 'Full recovery day' },
        { dayLabel: 'Day 4', sessionType: 'endurance', durationMin: 45, rationale: 'Short easy spin' },
        { dayLabel: 'Day 5', sessionType: 'recovery', durationMin: 20, rationale: 'Activation openers only' },
        { dayLabel: 'Day 6', sessionType: 'recovery', durationMin: 0, rationale: 'Rest before event' },
        { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 0, rationale: 'Race day' },
      ],
    }
  }

  if (isSharpeningWeek) {
    return {
      headline: 'Sharpening week — one key session, reduce volume.',
      slots: [
        { dayLabel: 'Day 1', sessionType: 'endurance', durationMin: 75, rationale: 'Comfortable aerobic base' },
        { dayLabel: 'Day 2', sessionType: 'threshold', durationMin: 70, rationale: 'One quality threshold set — shortened' },
        { dayLabel: 'Day 3', sessionType: 'recovery', durationMin: 40, rationale: 'Easy recovery' },
        { dayLabel: 'Day 4', sessionType: 'tempo', durationMin: 60, rationale: 'Light tempo to maintain sharpness' },
        { dayLabel: 'Day 5', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
        { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 90, rationale: 'Moderate long ride' },
        { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Easy spin' },
      ],
    }
  }

  // Standard week based on phase + freshness
  if (currentPhase === 'base') {
    return {
      headline: isFatigued
        ? 'Base phase — back off this week to absorb recent work.'
        : 'Base phase — build aerobic foundation.',
      slots: isFatigued
        ? [
            { dayLabel: 'Day 1', sessionType: 'endurance', durationMin: 75, rationale: 'Long Z2 base' },
            { dayLabel: 'Day 2', sessionType: 'recovery', durationMin: 45, rationale: 'Active recovery' },
            { dayLabel: 'Day 3', sessionType: 'endurance', durationMin: 60, rationale: 'Moderate Z2' },
            { dayLabel: 'Day 4', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
            { dayLabel: 'Day 5', sessionType: 'tempo', durationMin: 60, rationale: 'Single tempo block' },
            { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 90, rationale: 'Long ride at easy pace' },
            { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
          ]
        : [
            { dayLabel: 'Day 1', sessionType: 'endurance', durationMin: 90, rationale: 'Aerobic base building' },
            { dayLabel: 'Day 2', sessionType: 'tempo', durationMin: 60, rationale: 'Moderate effort block' },
            { dayLabel: 'Day 3', sessionType: 'strength', durationMin: 45, rationale: 'Off-bike strength session' },
            { dayLabel: 'Day 4', sessionType: 'recovery', durationMin: 45, rationale: 'Active recovery' },
            { dayLabel: 'Day 5', sessionType: 'threshold', durationMin: 75, rationale: 'Threshold stimulus' },
            { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 120, rationale: 'Long aerobic ride' },
            { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
          ],
    }
  }

  if (currentPhase === 'build') {
    const keySession: SessionType = goal === 'ftp_increase' || goal === 'climbing_sustainability' ? 'threshold' : 'vo2max'
    return {
      headline: isFresh
        ? 'Build phase — high form, prioritize quality intensity.'
        : 'Build phase — steady progression.',
      slots: [
        { dayLabel: 'Day 1', sessionType: 'vo2max', durationMin: 75, rationale: 'VO2 intervals — exploit freshness' },
        { dayLabel: 'Day 2', sessionType: 'strength', durationMin: 45, rationale: 'Strength support' },
        { dayLabel: 'Day 3', sessionType: keySession, durationMin: 90, rationale: `${keySession === 'threshold' ? 'Threshold' : 'VO2'} key session` },
        { dayLabel: 'Day 4', sessionType: 'recovery', durationMin: 45, rationale: 'Recovery between hard days' },
        { dayLabel: 'Day 5', sessionType: 'anaerobic', durationMin: 60, rationale: 'Short sharp anaerobic work' },
        { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 120, rationale: 'Long aerobic ride' },
        { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
      ],
    }
  }

  if (currentPhase === 'peak') {
    return {
      headline: 'Peak phase — maximise intensity quality, reduce volume.',
      slots: [
        { dayLabel: 'Day 1', sessionType: 'anaerobic', durationMin: 60, rationale: 'Neuromuscular peak work' },
        { dayLabel: 'Day 2', sessionType: 'recovery', durationMin: 45, rationale: 'Recovery' },
        { dayLabel: 'Day 3', sessionType: 'threshold', durationMin: 75, rationale: 'Threshold sharpener' },
        { dayLabel: 'Day 4', sessionType: 'vo2max', durationMin: 60, rationale: 'VO2 quality session' },
        { dayLabel: 'Day 5', sessionType: 'recovery', durationMin: 45, rationale: 'Rest' },
        { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 150, rationale: 'Peak long ride' },
        { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
      ],
    }
  }

  // recovery phase
  return {
    headline: 'Recovery phase — absorb, reset, and prepare for next block.',
    slots: [
      { dayLabel: 'Day 1', sessionType: 'recovery', durationMin: 45, rationale: 'Full easy spin' },
      { dayLabel: 'Day 2', sessionType: 'endurance', durationMin: 75, rationale: 'Easy aerobic' },
      { dayLabel: 'Day 3', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
      { dayLabel: 'Day 4', sessionType: 'tempo', durationMin: 60, rationale: 'Light tempo to maintain adaptation' },
      { dayLabel: 'Day 5', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
      { dayLabel: 'Day 6', sessionType: 'endurance', durationMin: 90, rationale: 'Long easy ride' },
      { dayLabel: 'Day 7', sessionType: 'recovery', durationMin: 30, rationale: 'Rest' },
    ],
  }
}

// ─── Season Phase Overview ────────────────────────────────────────────────────

export type PhaseOverviewPoint = {
  weekLabel: string
  phase: TrainingPhase
  totalHours: number
  intensityScore: number
  isCurrentWeek: boolean
}

export function computeSeasonPhaseOverview(plan: TrainingPlan): PhaseOverviewPoint[] {
  const today = new Date()
  const planStart = new Date(plan.startDate)
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const currentWeekIndex = Math.floor((today.getTime() - planStart.getTime()) / msPerWeek)

  return plan.weeks.map((week, index) => {
    const intensityScore = week.sessions.reduce((sum, session) => {
      const map: Record<string, number> = { easy: 1, moderate: 2, hard: 3, very_hard: 4 }
      return sum + (map[session.intensity] || 0)
    }, 0)

    return {
      weekLabel: `W${week.weekNumber}`,
      phase: week.phase,
      totalHours: Math.round(week.totalHours * 10) / 10,
      intensityScore,
      isCurrentWeek: index === currentWeekIndex,
    }
  })
}

// ─── Training Monotony Index ──────────────────────────────────────────────────

export type MonotonyStatus = 'varied' | 'moderate' | 'monotonous'

export type MonotonyIndex = {
  score: number                 // monotony = mean/SD of daily load, higher = more monotonous
  status: MonotonyStatus
  strain: number                // strain = weekly load × monotony (TP concept)
  guidance: string
}

export function computeMonotonyIndex(loadSeries: DailyLoadPoint[], days = 14): MonotonyIndex {
  const recent = loadSeries.slice(-days)
  if (recent.length < 4) {
    return {
      score: 0,
      status: 'varied',
      strain: 0,
      guidance: 'Not enough data to compute monotony index.',
    }
  }

  const loads = recent.map((p) => p.effectiveStress)
  const mean = loads.reduce((sum, l) => sum + l, 0) / loads.length

  if (mean <= 0) {
    return { score: 0, status: 'varied', strain: 0, guidance: 'No training load recorded in this window.' }
  }

  const variance = loads.reduce((sum, l) => sum + (l - mean) ** 2, 0) / loads.length
  const sd = Math.sqrt(variance)
  const monotony = sd > 0 ? Math.round((mean / sd) * 10) / 10 : 10
  const weeklyLoad = loads.reduce((sum, l) => sum + l, 0)
  const strain = Math.round(weeklyLoad * monotony * 10) / 10

  const status: MonotonyStatus =
    monotony > 2.0 ? 'monotonous' : monotony > 1.5 ? 'moderate' : 'varied'

  const guidance =
    status === 'monotonous'
      ? `Monotony score ${monotony.toFixed(1)} is high. Add variety (easy days, different session types) to reduce overuse risk.`
      : status === 'moderate'
      ? `Monotony score ${monotony.toFixed(1)} is acceptable but trending toward sameness. Include a full rest or very easy day this week.`
      : `Monotony score ${monotony.toFixed(1)} is low — good training variety. Strain index: ${strain.toFixed(0)}.`

  return { score: monotony, status, strain, guidance }
}
