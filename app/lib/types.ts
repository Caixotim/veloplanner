/**
 * Core types for Cycling AI Training Plans
 */

export type Equipment = 'resistance_bands' | 'rowing_machine' | 'dumbbells' | 'indoor_trainer'

export type TrainingGoal = 'ftp_increase' | 'climbing_sustainability' | 'endurance' | 'recovery'

export type IntensityDistribution = 'conservative' | 'aggressive'

export type QualityPriority = 'conservative' | 'balanced' | 'aggressive'

export type ShortDayPreference = 'mixed' | 'vo2_micro' | 'threshold_blocks' | 'strength_focus'

export type DietPreference = 'balanced' | 'mediterranean' | 'high_protein' | 'vegetarian' | 'vegan' | 'pescetarian'

export type InjuryType = 'knee' | 'lower_back' | 'shoulder' | 'none'

export type EventPriority = 'A' | 'B' | 'C'

export type TrainingPhase = 'build' | 'peak' | 'recovery' | 'base'

export type SessionType = 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic' | 'strength' | 'recovery'

export type TrainingPlanStatus = 'draft' | 'active' | 'archived'

export type StressSource = 'planned' | 'completed'

export interface UserProfile {
  id: string
  planName?: string
  age: number
  height: number // cm
  weight: number // kg
  goal: TrainingGoal
  intensityDistribution?: IntensityDistribution
  qualityPriority?: QualityPriority
  hardSessionsPerWeekCap?: 1 | 2 | 3
  shortDayPreference?: ShortDayPreference
  dietPreference?: DietPreference
  dailyCalorieTarget?: number
  dailyProteinTargetGrams?: number
  dailyCarbTargetGrams?: number
  dailyFatTargetGrams?: number
  planStartDate?: string // YYYY-MM-DD local date
  timezone?: string // IANA timezone used for plan and Intervals calendar dates
  desiredPlanWeeks?: number
  ftpIncreaseTargetWatts?: number
  plannedEvents?: Array<{
    id: string
    name: string
    date: string // YYYY-MM-DD
    priority: EventPriority
  }>
  injuries: InjuryType[]
  equipment: Equipment[]
  hasPowerMeter: boolean // NEW: Does user have a power meter?
  availableTime: {
    monday?: number // hours
    tuesday?: number
    wednesday?: number
    thursday?: number
    friday?: number
    saturday?: number
    sunday?: number
  }
  ftp?: number // watts
  maxHeartRate?: number
  createdAt: Date
  updatedAt: Date
}

export type SessionCompletionStatus = 'pending' | 'completed' | 'skipped' | 'partial'

export interface SessionCompletion {
  sessionId: string
  planId: string
  status: SessionCompletionStatus
  rpe?: number // 1-10 RPE scale
  feeling?: 'great' | 'good' | 'ok' | 'bad' | 'terrible'
  actualDurationMinutes?: number
  actualPower?: number
  actualHR?: number
  notes?: string
  completedAt: number // timestamp
  matchedRideId?: string // linked Intervals ride id
}

export interface TrainingZoneConfig {
  label: string // e.g. "Z2 Aerobic"
  minPct: number // % of FTP
  maxPct: number
  minHRPct?: number // % of max HR
  maxHRPct?: number
  color?: string
}

export interface UserZoneProfile {
  id: string
  ftp: number
  maxHR: number
  zones: TrainingZoneConfig[]
  createdAt: number
  updatedAt: number
}

export interface DailyReadinessEntry {
  date: string // YYYY-MM-DD local date
  sleepQuality: 1 | 2 | 3 | 4 | 5
  stressLevel: 1 | 2 | 3 | 4 | 5
  muscleSoreness: 1 | 2 | 3 | 4 | 5
  notes?: string
  updatedAt: number
}

export interface BodyMetricsEntry {
  date: string // YYYY-MM-DD local date
  weightKg?: number
  restingHr?: number
  hrvMs?: number
  notes?: string
  updatedAt: number
}

export interface TrainingSession {
  id: string
  date: Date
  dayOfWeek: number
  type: SessionType
  duration: number // minutes
  intensity: 'easy' | 'moderate' | 'hard' | 'very_hard'
  description: string
  focus: string[]
  equipment: Equipment[]
  notes?: string
  structuredWorkout?: string[]
  plannedPower?: number // watts for FTP percentage
  plannedHeartRate?: {
    min: number
    max: number
  }
  zoneVersionLabel?: string
  zoneVersionFtp?: number
  plannedStress?: number
  completedStress?: number
  localUpdatedAt?: string
  preDayNutritionTip?: string
  // Completion data embedded for quick calendar rendering
  completion?: SessionCompletion
}

export interface DailyLoadPoint {
  date: string // YYYY-MM-DD
  plannedStress: number
  completedStress: number
  effectiveStress: number
  ctl: number
  atl: number
  tsb: number
  ramp7d: number
}

export interface LoadModelSummary {
  currentCtl: number
  currentAtl: number
  currentTsb: number
  currentRamp7d: number
  weeklyStressPlanned: number
  weeklyStressCompleted: number
  plannedStressNext7d: number
  projectedCtl7d: number
  projectedTsb7d: number
}

export interface TrainingWeek {
  weekNumber: number
  phase: TrainingPhase
  focusPoints: string[]
  sessions: TrainingSession[]
  totalHours: number
}

export interface TrainingPlan {
  id: string
  externalPlanId?: string
  userId: string
  timezone?: string // IANA timezone used for Intervals event dates
  /** Lifecycle state used by cloud persistence; omitted for legacy local plans. */
  status?: TrainingPlanStatus
  revision?: number
  name: string
  goal: TrainingGoal
  durationWeeks: number
  startDate: Date
  endDate: Date
  weeks: TrainingWeek[]
  mealSuggestions: MealSuggestion[]
  targetMetrics: {
    ftpTarget?: number
    ftpIncreaseTargetWatts?: number
    climbingWatts?: number
    climbingWattsPerKg?: number
    enduranceHours?: number
  }
  intervalsSync?: {
    syncedAt?: string
    lastError?: string
  }
  publishedAt?: string
  createdAt: Date
  updatedAt: Date
}

export interface MealSuggestion {
  id: string
  weekNumber: number
  dayOfWeek?: number
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'post_workout'
  name: string
  description: string
  timingTip: string
  ingredients: string[]
  caloriesEstimate: number
  carbs: number // grams
  proteins: number // grams
  fats: number // grams
  portugueseIngredients: boolean
  prepTimeMinutes: number
  nutritionSource?: 'heuristic' | 'usda'
}

export interface IntervalsIcuData {
  userId: string
  lastSync: Date
  avgPower: number // watts
  maxPower: number
  energyExpended: number // kJ
  heartRateAvg?: number
  heartRateMax?: number
  altitude?: number
  distance?: number // km
  duration: number // seconds
  cadence?: number
}

export interface FocusPoint {
  id: string
  title: string
  description: string
  icon: string
  weekRange: { start: number; end: number }
  exercises: string[]
  duration: number // minutes per session
}

/**
 * Detectable changes from Intervals.icu sync
 */
export interface DetectedChange {
  type: 'ftp_increase' | 'ftp_decrease' | 'new_pr' | 'fatigue' | 'new_rides'
  label: string
  before: number
  after: number
  confidence: number // 0-1
}

/**
 * Result of Intervals.icu sync operation
 */
export interface SyncResult {
  success: boolean
  timestamp: number
  newRidesCount: number
  changes: DetectedChange[]
  beforeProfile: UserProfile
  afterProfile: UserProfile
  error?: string
}

/**
 * Represents a single change to a training session
 */
export interface SessionChange {
  fieldName: string
  before: unknown
  after: unknown
}

/**
 * Tracks modifications to plan vs original
 */
export interface PlanDiff {
  planId: string
  sessionEdits: Map<string, SessionChange[]> // key: "${weekNumber}-${dayIndex}"
  totalChanges: number
  lastModified: number
  changedSessions: Array<{
    weekNumber: number
    dayIndex: number
    changes: SessionChange[]
  }>
}
