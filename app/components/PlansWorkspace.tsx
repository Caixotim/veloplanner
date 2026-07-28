'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { UserProfileForm } from './UserProfileForm'
import { TrainingPlanDisplay } from './TrainingPlanDisplay'
import { MealSuggestions } from './MealSuggestions'

import SessionEditorModal from './SessionEditorModal'
import SessionCompletionModal from './SessionCompletionModal'
import ZoneWizard from './ZoneWizard'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { buildRideMatchMap } from '../lib/rideMatcher'
import type { RideMatchMap } from '../lib/rideMatcher'
import { buildAthletePlanContext, buildPlanRequest, generateTrainingPlan } from '../lib/trainingPlanner'
import { buildDailyLoadSeries } from '../lib/loadModel'
import { generateMealSuggestionsWithApi } from '../lib/mealPlanner'
import { computeThresholdHistory } from '../lib/thresholdHistory'
import {
  openPlanForPrint,
  exportPlanToCSV,
  downloadCSV,
  exportPlanToICS,
  downloadICS,
  exportPlanWorkoutBundleZip,
} from '../lib/exportPlan'
import { storage, type StoredPlan } from '../lib/storage'
import { syncIntervalsDelta, isIntervalsSyncNeeded, getIntervalsTrainingInsights, fetchIntervalsBlockedDates, fetchPlansFromIntervals } from '../lib/intervalsIntegration'
import { buildIntervalsCredentialHeaders, getIntervalsCredentials, type IntervalsCredentials } from '../lib/integrationCredentials'
import { comparePlans, getChangeSummary } from '../lib/diffPlanner'
import { useAnalytics } from '../lib/analytics'
import { useSyncWorker } from '../lib/useSyncWorker'
import type { BodyMetricsEntry, DailyReadinessEntry, PlanDiff, SyncResult, SessionCompletion, TrainingGoal, TrainingPlan, TrainingSession, UserProfile, UserZoneProfile } from '../lib/types'
import type { AthleteRideSignature, IntervalsTrainingInsights } from '../lib/intervalsIntegration'
import styles from '../page.module.scss'
import TrainingCalendar from './TrainingCalendar'
import { BodyMetricsLog } from './BodyMetricsLog'
import PerformanceCharts from './PerformanceCharts'
import { SeasonPlanner } from './SeasonPlanner'
import { DailyNutritionGuide } from './DailyNutritionGuide'
import {
  CalendarIcon,
  ChartIcon,
  CompassIcon,
  DownloadIcon,
  FileIcon,
  LayersIcon,
  PrinterIcon,
  SunIcon,
  TableIcon,
} from './icons/AppIcons'


type IntervalsRidePoint = {
  date: number
  maxPower: number
  avgPower?: number
  normalizedPower?: number
  ftpWatts?: number
  avgHR: number
  duration: number
  distance: number
}

type PlanSyncMode = 'upsert' | 'replace' | 'delete'

type EditingSession = {
  weekNumber: number
  dayOfWeek: number
  session: TrainingSession
}

type SessionModalMode = 'view' | 'edit'

type SyncDecisionAudit = {
  timestamp: number
  remoteDeleted: number
  remoteUpdated: number
  localKept: number
  pushedLocal: number
  deferredRemoteDeletes: number
}

type SyncReconciliationMode = 'conservative' | 'strict_mirror'

const QUALITY_PRIORITY_LABELS: Record<NonNullable<UserProfile['qualityPriority']>, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
}

const SHORT_DAY_PREFERENCE_LABELS: Record<NonNullable<UserProfile['shortDayPreference']>, string> = {
  mixed: 'Mixed',
  vo2_micro: 'VO2 Micro',
  threshold_blocks: 'Threshold Blocks',
  strength_focus: 'Strength Focus',
}

export default function PlansWorkspace() {
  const [plan, setPlan] = useState<TrainingPlan | null>(null)
  const [currentPlan, setCurrentPlan] = useState<TrainingPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<Partial<UserProfile> | null>(null)
  const [planDiff, setPlanDiff] = useState<PlanDiff | null>(null)
  const [changedSessions, setChangedSessions] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null)
  const [sessionModalMode, setSessionModalMode] = useState<SessionModalMode>('edit')
  const [intervalsSyncStatus, setIntervalsSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [lastSyncAudit, setLastSyncAudit] = useState<SyncDecisionAudit | null>(null)
  const [syncReconciliationMode, setSyncReconciliationMode] = useState<SyncReconciliationMode>('conservative')
  const [intervalsChanges, setIntervalsChanges] = useState<SyncResult['changes']>([])
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [intervalsCredentials, setIntervalsCredentials] = useState<IntervalsCredentials | null>(null)
  const [intervalsRideData, setIntervalsRideData] = useState<IntervalsRidePoint[]>([])
  const [latestIntervalsInsights, setLatestIntervalsInsights] = useState<IntervalsTrainingInsights | null>(null)
  const [autoRetargetOnFtpSync, setAutoRetargetOnFtpSync] = useState(true)
  const [storedPlans, setStoredPlans] = useState<StoredPlan[]>([])
  const [backupPlans, setBackupPlans] = useState<TrainingPlan[]>([])
  const [showBackupPlans, setShowBackupPlans] = useState(false)
  const [mealPlanExpanded, setMealPlanExpanded] = useState(false)
  type WorkspaceTab = 'today' | 'calendar' | 'season' | 'summary' | 'analytics' | 'exports'
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('calendar')
  const [calendarAutoScrollSignal, setCalendarAutoScrollSignal] = useState(0)
  const [activeCoachActionKey, setActiveCoachActionKey] = useState<string | null>(null)
  const [coachActionPulseToken, setCoachActionPulseToken] = useState(0)

  // Completion / RPE log
  const [completionModalSession, setCompletionModalSession] = useState<{ session: TrainingSession; weekNumber: number } | null>(null)
  const [planCompletions, setPlanCompletions] = useState<Map<string, SessionCompletion>>(new Map())
  const [todayReadiness, setTodayReadiness] = useState<DailyReadinessEntry | undefined>(undefined)
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetricsEntry[]>([])

  // Zone wizard
  const [zoneWizardOpen, setZoneWizardOpen] = useState(false)
  const [activeZoneProfile, setActiveZoneProfile] = useState<UserZoneProfile | null>(null)

  const { trackEvent, startTimer, endTimer, trackMetric } = useAnalytics()

  const loadRecentRideData = useCallback(async () => {
    const eightyFourDaysAgo = Date.now() - 84 * 24 * 60 * 60 * 1000
    const cachedRides = (await storage.getCachedRides(eightyFourDaysAgo)) as Array<{
      rideDate?: number
      maxPower?: number
      averagePower?: number
      normalizedPower?: number
      ftpWatts?: number
      avgHR?: number
      duration?: number
      distance?: number
    }>

    const mappedRides = cachedRides
      .map((ride) => ({
        date: typeof ride.rideDate === 'number' ? ride.rideDate : 0,
        maxPower: Math.round(ride.maxPower || 0),
        avgPower: Math.round(ride.averagePower || ride.normalizedPower || 0),
        normalizedPower: Math.round(ride.normalizedPower || 0),
        ftpWatts: Math.round(ride.ftpWatts || 0),
        avgHR: Math.round(ride.avgHR || 0),
        duration: Math.round(ride.duration || 0),
        distance: Math.round(ride.distance || 0),
      }))
      .filter((ride) => ride.date > 0)
      .sort((a, b) => a.date - b.date)

    setIntervalsRideData(mappedRides)
  }, [])

  const handleWorkerSyncResult = useCallback(
    (result: {
      success: boolean
      newRidesCount: number
      changes: Array<{ type: string; label: string }>
      error?: string
      timestamp: number
    }) => {
      if (result.success) {
        void loadRecentRideData()
        setLastSyncTime(result.timestamp)
        setSyncMessage(`Background sync: ${result.newRidesCount} new ride(s)`)
        setIntervalsSyncStatus('success')
        trackEvent('intervals_sync_completed', {
          source: 'worker',
          ridesCount: result.newRidesCount,
          changesCount: result.changes.length,
        })
      } else {
        setIntervalsSyncStatus('error')
        setSyncMessage(`Background sync failed: ${result.error || 'Unknown error'}`)
        trackEvent('intervals_sync_failed', {
          source: 'worker',
          error: result.error || 'Unknown error',
        })
      }
    },
    [loadRecentRideData, trackEvent]
  )

  const { isRunning, startSync, stopSync } = useSyncWorker(intervalsCredentials, handleWorkerSyncResult)

  const hasChanges = useMemo(() => changedSessions.size > 0, [changedSessions])

  const matchedRides = useMemo<RideMatchMap>(() => {
    if (!currentPlan || intervalsRideData.length === 0) return new Map()
    const allSessions = currentPlan.weeks.flatMap((w) => w.sessions)
    const sessionDates = allSessions
      .filter((s) => s.type !== 'recovery' || s.duration > 0)
      .map((s) => new Date(s.date))
    const rides = intervalsRideData.map((r) => ({
      date: r.date,
      duration: r.duration,
      avgPower: r.avgPower,
      normalizedPower: r.normalizedPower,
      maxPower: r.maxPower,
      ftpWatts: r.ftpWatts,
      avgHR: r.avgHR,
      distance: r.distance,
    }))
    return buildRideMatchMap(rides, sessionDates)
  }, [currentPlan, intervalsRideData])

  useEffect(() => {
    if (activeWorkspaceTab === 'calendar') {
      setCalendarAutoScrollSignal((current) => current + 1)
    }
  }, [activeWorkspaceTab])

  // Load completions when active plan changes
  useEffect(() => {
    if (!currentPlan) return
    storage.getCompletionsForPlan(currentPlan.id).then((completions) => {
      const map = new Map<string, SessionCompletion>()
      for (const c of completions) map.set(c.sessionId, c)
      setPlanCompletions(map)
    }).catch(() => {})
  }, [currentPlan?.id])

  // Load zone profile on init
  useEffect(() => {
    storage.getZoneProfile().then((profile) => {
      if (profile) setActiveZoneProfile(profile)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    storage.getDailyReadiness(todayKey).then((entry) => setTodayReadiness(entry)).catch(() => {})
  }, [])

  useEffect(() => {
    storage.getBodyMetrics().then((entries) => setBodyMetrics(entries)).catch(() => {})
  }, [])

  const handleSaveCompletion = useCallback(async (completion: SessionCompletion) => {
    try {
      await storage.saveCompletion(completion)
      setPlanCompletions((prev) => new Map(prev).set(completion.sessionId, completion))
    } catch (err) {
      console.error('Failed to save completion', err)
    }
    setCompletionModalSession(null)
  }, [])

  const handleDeleteCompletion = useCallback(async (sessionId: string) => {
    try {
      await storage.deleteCompletion(sessionId)
      setPlanCompletions((prev) => {
        const next = new Map(prev)
        next.delete(sessionId)
        return next
      })
    } catch (err) {
      console.error('Failed to delete completion', err)
    }
    setCompletionModalSession(null)
  }, [])

  const handleSaveZoneProfile = useCallback(async (profile: UserZoneProfile) => {
    try {
      await storage.saveZoneProfile(profile)
      setActiveZoneProfile(profile)
    } catch (err) {
      console.error('Failed to save zone profile', err)
    }
    setZoneWizardOpen(false)
  }, [])

  const refreshIntervalsInsightsSnapshot = useCallback(
    async (weightKg?: number) => {
      try {
        const snapshot = await getIntervalsTrainingInsights(weightKg)
        setLatestIntervalsInsights(snapshot)
        return snapshot
      } catch (error) {
        console.warn('Failed to refresh Intervals insights snapshot', { error })
        return null
      }
    },
    []
  )

  const ftpFromRecentRides = useMemo(() => {
    const ftpCandidates = intervalsRideData.map((ride) => ride.ftpWatts || 0).filter((value) => value > 0)
    if (ftpCandidates.length > 0) {
      return Math.round(ftpCandidates.reduce((sum, value) => sum + value, 0) / ftpCandidates.length)
    }

    const normalizedCandidates = intervalsRideData.map((ride) => ride.normalizedPower || 0).filter((value) => value > 0)
    if (normalizedCandidates.length > 0) {
      return Math.round(Math.max(...normalizedCandidates) * 0.95)
    }

    return 0
  }, [intervalsRideData])

  const effectiveFtpTarget = useMemo(() => {
    if (!currentPlan) {
      return undefined
    }

    if (currentPlan.targetMetrics.ftpTarget) {
      return currentPlan.targetMetrics.ftpTarget
    }

    if (ftpFromRecentRides > 0) {
      return ftpFromRecentRides + (currentPlan.targetMetrics.ftpIncreaseTargetWatts || 0)
    }

    return undefined
  }, [currentPlan, ftpFromRecentRides])

  const zoneVersionOptions = useMemo(() => {
    const history = computeThresholdHistory(intervalsRideData, effectiveFtpTarget)
    return history.map((snapshot) => ({
      versionLabel: snapshot.versionLabel,
      ftp: snapshot.ftp,
      date: snapshot.date,
    }))
  }, [effectiveFtpTarget, intervalsRideData])

  const ftpSourceDetails = useMemo(() => {
    const profileFtp = userProfile?.ftp

    if (typeof profileFtp === 'number' && profileFtp > 0) {
      if (ftpFromRecentRides > 0 && Math.abs(profileFtp - ftpFromRecentRides) <= 5) {
        return {
          source: 'Intervals sync',
          baselineFtp: profileFtp,
        }
      }

      return {
        source: 'Manual profile',
        baselineFtp: profileFtp,
      }
    }

    if (ftpFromRecentRides > 0) {
      return {
        source: 'Intervals estimate',
        baselineFtp: ftpFromRecentRides,
      }
    }

    return {
      source: 'Not available',
      baselineFtp: undefined,
    }
  }, [ftpFromRecentRides, userProfile?.ftp])

  const plannerStrategySummary = useMemo(() => {
    const qualityPriority = userProfile?.qualityPriority || 'balanced'
    const hardSessionCap = userProfile?.hardSessionsPerWeekCap || 2
    const shortDayPreference = userProfile?.shortDayPreference || 'mixed'

    return {
      qualityPriority,
      qualityPriorityLabel: QUALITY_PRIORITY_LABELS[qualityPriority],
      hardSessionCap,
      shortDayPreference,
      shortDayPreferenceLabel: SHORT_DAY_PREFERENCE_LABELS[shortDayPreference],
    }
  }, [userProfile?.hardSessionsPerWeekCap, userProfile?.qualityPriority, userProfile?.shortDayPreference])

  const ftpGainTargetLabel = useMemo(() => {
    const requestedGain = userProfile?.ftpIncreaseTargetWatts
    const assessedGain = currentPlan?.targetMetrics.ftpIncreaseTargetWatts

    if (typeof requestedGain === 'number' && requestedGain > 0) {
      return `+${requestedGain}W`
    }

    if (typeof assessedGain === 'number' && assessedGain > 0) {
      return typeof requestedGain === 'number' && requestedGain === 0
        ? `Auto-assessed: +${assessedGain}W`
        : `+${assessedGain}W`
    }

    if (typeof requestedGain === 'number' && requestedGain === 0) {
      return 'Auto-assess pending'
    }

    return 'N/A'
  }, [currentPlan?.targetMetrics.ftpIncreaseTargetWatts, userProfile?.ftpIncreaseTargetWatts])

  const sessionHighlightMatcher = useMemo(() => {
    if (!activeCoachActionKey) {
      return undefined
    }

    return (session: TrainingSession): boolean => {
      switch (activeCoachActionKey) {
        case 'reduce_fatigue':
          return session.type === 'recovery' || session.type === 'endurance'
        case 'use_freshness_quality':
          return session.type === 'threshold' || session.type === 'vo2max' || session.type === 'anaerobic'
        case 'raise_session_frequency':
          return session.type === 'endurance' || session.type === 'recovery' || session.type === 'tempo'
        case 'build_aerobic_durability':
          return session.type === 'endurance' || session.type === 'tempo'
        case 'stabilize_internal_load':
          return session.type === 'recovery' || session.type === 'endurance'
        case 'stage_ftp_progression':
          return session.type === 'threshold' || session.type === 'tempo'
        default:
          return false
      }
    }
  }, [activeCoachActionKey])

  const handleCoachActionSelect = useCallback((actionKey: string | null) => {
    setActiveCoachActionKey(actionKey)

    if (!actionKey) {
      return
    }

    setCoachActionPulseToken((current) => current + 1)

    if (typeof window !== 'undefined') {
      const calendarSection = document.getElementById('training-calendar')
      if (calendarSection) {
        calendarSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [])

  const calendarFatigueRiskByDate = useMemo(() => {
    if (!currentPlan) {
      return {}
    }

    const series = buildDailyLoadSeries({
      plan: currentPlan,
      rides: intervalsRideData,
      ftpFallback: typeof effectiveFtpTarget === 'number' && effectiveFtpTarget > 0 ? effectiveFtpTarget : undefined,
    })

    const riskByDate: Record<string, 'none' | 'watch' | 'risk'> = {}
    for (const point of series) {
      const hasPlannedOrCompleted = point.plannedStress > 0 || point.completedStress > 0
      if (!hasPlannedOrCompleted) {
        continue
      }

      if (point.tsb <= -12 || point.ramp7d > 140) {
        riskByDate[point.date] = 'risk'
      } else if (point.tsb <= -7 || point.ramp7d > 90) {
        riskByDate[point.date] = 'watch'
      } else {
        riskByDate[point.date] = 'none'
      }
    }

    return riskByDate
  }, [currentPlan, effectiveFtpTarget, intervalsRideData])

  const calendarFatigueDetailsByDate = useMemo(() => {
    if (!currentPlan) {
      return {}
    }

    const series = buildDailyLoadSeries({
      plan: currentPlan,
      rides: intervalsRideData,
      ftpFallback: typeof effectiveFtpTarget === 'number' && effectiveFtpTarget > 0 ? effectiveFtpTarget : undefined,
    })

    const detailsByDate: Record<
      string,
      {
        tsb: number
        ramp7d: number
        plannedStress: number
        completedStress: number
        risk: 'none' | 'watch' | 'risk'
      }
    > = {}

    for (const point of series) {
      const hasPlannedOrCompleted = point.plannedStress > 0 || point.completedStress > 0
      if (!hasPlannedOrCompleted) {
        continue
      }

      const risk: 'none' | 'watch' | 'risk' =
        point.tsb <= -12 || point.ramp7d > 140
          ? 'risk'
          : point.tsb <= -7 || point.ramp7d > 90
          ? 'watch'
          : 'none'

      detailsByDate[point.date] = {
        tsb: point.tsb,
        ramp7d: point.ramp7d,
        plannedStress: point.plannedStress,
        completedStress: point.completedStress,
        risk,
      }
    }

    return detailsByDate
  }, [currentPlan, effectiveFtpTarget, intervalsRideData])

  const refreshStoredPlans = useCallback(async () => {
    const plans = await storage.loadAllPlans()
    const sortedPlans = [...plans].sort((a, b) => b.updatedAt - a.updatedAt)
    setStoredPlans(sortedPlans)
    return sortedPlans
  }, [])

  const repairCollapsedPlan = useCallback(async (planToRepair: TrainingPlan, profileSeed?: Partial<UserProfile> | null) => {
    if (!hasCollapsedFutureWeeks(planToRepair)) {
      return planToRepair
    }

    const repairProfile = buildAthleteProfileTemplate({
      ...buildEditableProfile(planToRepair, profileSeed),
      id: planToRepair.userId,
      planName: planToRepair.name,
      goal: planToRepair.goal,
      planStartDate: formatDateInput(planToRepair.startDate),
      desiredPlanWeeks: planToRepair.durationWeeks,
    })

    try {
      const planRequest = buildPlanRequest(repairProfile)
      const intervalsInsights = await getIntervalsTrainingInsights(repairProfile.weight)
      const blockedDates = await fetchIntervalsBlockedDates(
        formatDateInput(planRequest.startDate),
        formatDateInput(new Date(planRequest.startDate.getTime() + planRequest.durationWeeks * 7 * 24 * 60 * 60 * 1000))
      )

      const regeneratedPlan = generateTrainingPlan(planToRepair.userId, planRequest, buildAthletePlanContext(repairProfile), {
        intervalsInsights,
        blockedDates,
      })

      return mergeCollapsedPlanWithRegeneratedWeeks(planToRepair, regeneratedPlan)
    } catch (repairError) {
      console.warn('Failed to regenerate collapsed plan; keeping current plan', { repairError })
      return planToRepair
    }
  }, [])

  const loadProfileForPlan = useCallback(async (planToLoad: TrainingPlan) => {
    const storedProfile = await storage.loadProfile(planToLoad.userId)

    if (storedProfile) {
      setUserProfile(storedProfile)
      return storedProfile
    }

    setUserProfile(buildEditableProfile(planToLoad))
    return null
  }, [])

  const restoreBackupPlan = useCallback(
    async (backupPlan: TrainingPlan) => {
      try {
        setLoading(true)
        const storedPlan = { id: backupPlan.id, plan: backupPlan, updatedAt: Date.now(), createdAt: Date.now() }
        await storage.savePlan(backupPlan, false)

        setPlan(backupPlan)
        setCurrentPlan(backupPlan)
        setSyncMessage(`Restored plan "${backupPlan.name}" from Intervals.icu`)
        setShowBackupPlans(false)

        await refreshStoredPlans()
        trackEvent('plan_restored_from_intervals', {
          planId: backupPlan.id,
          durationWeeks: backupPlan.durationWeeks,
          goal: backupPlan.goal,
        })
      } catch (error) {
        console.error('Failed to restore backup plan', { error })
        setSyncMessage(`Failed to restore plan: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    },
    [refreshStoredPlans, trackEvent]
  )

  useEffect(() => {
    const init = async () => {
      try {
        await storage.init()
        console.info('Storage initialized')

        const [plans, storedProfiles] = await Promise.all([refreshStoredPlans(), storage.loadProfiles()])
        await loadRecentRideData()

        if (plans.length > 0) {
          const latestPlan = plans[0]
          const recoveredPlan = recoverCorruptedStoredPlan(latestPlan)
          const matchingProfile = storedProfiles.find((profile) => profile.id === recoveredPlan.userId) || buildEditableProfile(recoveredPlan)
          const activePlan = await repairCollapsedPlan(recoveredPlan, matchingProfile)
          if (activePlan !== latestPlan.plan) {
            await storage.updatePlan(latestPlan.id, activePlan)
          }

          setPlan(activePlan)
          setCurrentPlan(activePlan)
          setUserProfile(matchingProfile)
          await refreshIntervalsInsightsSnapshot(matchingProfile.weight)
          setSyncMessage(activePlan !== latestPlan.plan ? 'Recovered saved plan from original local snapshot' : 'Loaded latest saved plan')
        } else {
          // No local plans—try to fetch backup plans from Intervals.icu
          const backupResult = await fetchPlansFromIntervals()
          if (backupResult.success && backupResult.plans && backupResult.plans.length > 0) {
            setBackupPlans(backupResult.plans)
            setShowBackupPlans(true)
            setSyncMessage(`Found ${backupResult.plans.length} plan(s) on Intervals.icu. Click "Restore Backup Plans" to recover them.`)
          }
        }

        if (plans.length === 0 && storedProfiles.length > 0) {
          const latestProfile = [...storedProfiles].sort((a, b) => b.createdAt - a.createdAt)[0]
          setUserProfile(latestProfile)
          await refreshIntervalsInsightsSnapshot(latestProfile.weight)
        }

        const savedIntervalsCredentials = await getIntervalsCredentials()
        if (savedIntervalsCredentials) {
          setIntervalsCredentials(savedIntervalsCredentials)
          setAccessToken('intervals_connected')
          trackEvent('intervals_authenticated', { source: 'browser_credentials' })
        }

        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          if (params.get('oauth_success') === 'true') {
            trackEvent('intervals_authenticated', { source: 'oauth_callback' })
          }

          const oauthError = params.get('oauth_error')
          if (oauthError) {
            setIntervalsSyncStatus('error')
            setSyncMessage(`Intervals authorization failed: ${oauthError.replace(/_/g, ' ')}`)
            trackEvent('intervals_sync_failed', { source: 'oauth_callback', error: oauthError })
          }
        }
      } catch (error) {
        console.error('Initialization failed', { error })
      }
    }

    init()
  }, [loadRecentRideData, refreshIntervalsInsightsSnapshot, refreshStoredPlans, trackEvent])

  useEffect(() => {
    if (intervalsCredentials) {
      startSync()
    }

    return () => {
      stopSync()
    }
  }, [intervalsCredentials, startSync, stopSync])

  const performIntervalsSync = useCallback(async () => {
    if (!userProfile || !intervalsCredentials) {
      return
    }

    setIntervalsSyncStatus('syncing')
    setSyncMessage('Syncing with Intervals.icu...')
    startTimer('intervals_sync')

    try {
      const syncAudit: SyncDecisionAudit = {
        timestamp: Date.now(),
        remoteDeleted: 0,
        remoteUpdated: 0,
        localKept: 0,
        pushedLocal: 0,
        deferredRemoteDeletes: 0,
      }

      // ── Step 1: Check what sessions still exist in Intervals.icu ────────────
      // Do this BEFORE pushing anything so we don't accidentally re-add sessions
      // the user intentionally deleted in Intervals.icu.
      let planAfterDeletions = currentPlan
      let shouldForcePlanPush = false
      let missingRemoteSessionCount = 0
      let pendingLocalChanges = new Set(changedSessions)
      const localTrainableSessionCount =
        currentPlan?.weeks.flatMap((week) => week.sessions).filter((session) => session.duration > 0).length || 0
      const hasRecordedPlanSync = Boolean(currentPlan?.intervalsSync?.syncedAt)

      // If the plan has never been marked as synced, force a full upsert once.
      // This prevents "Sync Now" from skipping plan push when changedSessions is empty.
      if (currentPlan && localTrainableSessionCount > 0 && !hasRecordedPlanSync) {
        shouldForcePlanPush = true
        missingRemoteSessionCount = localTrainableSessionCount
      }

      if (currentPlan?.externalPlanId) {
        try {
          const checkResponse = await fetch('/api/intervals/plans/check', {
            method: 'POST',
            headers: await buildIntervalsCredentialHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ externalPlanId: currentPlan.externalPlanId }),
          })

          if (checkResponse.ok) {
            const checkPayload = (await checkResponse.json()) as {
              success: boolean
              existingDates: string[]
              matchCount: number
              events: Array<{
                date: string
                externalId: string
                sessionId: string | null
                name?: string
                description?: string
                movingTimeSeconds?: number
                workoutType?: string
                lastUpdatedAt?: string
              }>
            }

            // matchCount > 0 confirms the plan prefix is tracked in Intervals.icu.
            // If 0 events found, the plan hasn't been synced yet — skip removal.
            if (checkPayload.success && checkPayload.matchCount > 0) {
              const eventByDate = new Map(checkPayload.events.map((event) => [event.date, event]))
              const eventBySessionId = new Map(
                checkPayload.events
                  .filter((event): event is RemotePlanEventSnapshot & { sessionId: string } => Boolean(event.sessionId))
                  .map((event) => [event.sessionId, event])
              )
              const lastPlanSyncMs = toTimestampMs(currentPlan.intervalsSync?.syncedAt) ?? 0
              let hasPlanMutations = false

              const updatedWeeks = currentPlan.weeks.map((week) => {
                const updatedSessions = week.sessions.map((session) => {
                  const sessionKey = `${week.weekNumber}-${session.dayOfWeek}`
                  const localLastUpdatedMs = toTimestampMs(session.localUpdatedAt) ?? toTimestampMs(currentPlan.updatedAt) ?? 0
                  const localDateKey = formatDateInput(session.date)
                  const isLocallyDirty = pendingLocalChanges.has(sessionKey)
                  const remoteEvent = eventBySessionId.get(session.id) ?? eventByDate.get(localDateKey)
                  const wasPlannedSession = session.duration > 0 && session.type !== 'recovery'

                  if (!remoteEvent) {
                    if (!wasPlannedSession) {
                      return session
                    }

                    const keepLocalVersion = isLocallyDirty && localLastUpdatedMs > lastPlanSyncMs
                    if (keepLocalVersion) {
                      syncAudit.localKept += 1
                      return session
                    }

                    if (syncReconciliationMode === 'conservative') {
                      syncAudit.deferredRemoteDeletes += 1
                      return session
                    }

                    hasPlanMutations = true
                    pendingLocalChanges.delete(sessionKey)
                    syncAudit.remoteDeleted += 1
                    return toRestDayFromRemoval(session)
                  }

                  const remoteLastUpdatedMs = toTimestampMs(remoteEvent.lastUpdatedAt) ?? 0

                  if (!isLocallyDirty) {
                    if (remoteLastUpdatedMs > lastPlanSyncMs) {
                      hasPlanMutations = true
                      syncAudit.remoteUpdated += 1
                      return applyRemoteEventToSession(session, remoteEvent)
                    }

                    return session
                  }

                  if (remoteLastUpdatedMs > localLastUpdatedMs) {
                    hasPlanMutations = true
                    pendingLocalChanges.delete(sessionKey)
                    syncAudit.remoteUpdated += 1
                    return applyRemoteEventToSession(session, remoteEvent)
                  }

                  syncAudit.localKept += 1
                  return session
                })
                return {
                  ...week,
                  sessions: updatedSessions,
                  totalHours: updatedSessions.reduce((sum, s) => sum + s.duration / 60, 0),
                }
              })

              if (hasPlanMutations) {
                planAfterDeletions = { ...currentPlan, weeks: updatedWeeks, updatedAt: new Date() }
                await storage.updatePlan(planAfterDeletions.id, planAfterDeletions)
                setPlan(planAfterDeletions)
                setCurrentPlan(planAfterDeletions)
                setPlanDiff(null)
                setChangedSessions(pendingLocalChanges)

                const syncNotes: string[] = []
                if (syncAudit.remoteDeleted > 0) {
                  syncNotes.push(`${syncAudit.remoteDeleted} session(s) removed from local (deleted in Intervals.icu)`)
                }
                if (syncAudit.remoteUpdated > 0) {
                  syncNotes.push(`${syncAudit.remoteUpdated} session(s) refreshed from newer Intervals edits`)
                }
                if (syncAudit.localKept > 0) {
                  syncNotes.push(`${syncAudit.localKept} local edit(s) kept as latest`)
                }
                if (syncAudit.deferredRemoteDeletes > 0) {
                  syncNotes.push(`${syncAudit.deferredRemoteDeletes} remote deletion(s) deferred in conservative mode`)
                }

                if (syncNotes.length > 0) {
                  setSyncMessage(`Reconciled: ${syncNotes.join(' • ')}`)
                }
              }

              const remoteSessionIds = new Set(
                checkPayload.events
                  .map((event) => event.sessionId)
                  .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0)
              )
              const localTrainableSessions = (planAfterDeletions || currentPlan).weeks
                .flatMap((week) => week.sessions)
                .filter((session) => session.duration > 0)

              const missingRemoteSessions = localTrainableSessions.filter((session) => !remoteSessionIds.has(session.id))
              if (missingRemoteSessions.length > 0) {
                shouldForcePlanPush = true
                missingRemoteSessionCount = missingRemoteSessions.length
              }
            } else if (checkPayload.success && checkPayload.matchCount === 0) {
              const localTrainableCount = currentPlan.weeks
                .flatMap((week) => week.sessions)
                .filter((session) => session.duration > 0).length

              if (localTrainableCount > 0) {
                shouldForcePlanPush = true
                missingRemoteSessionCount = localTrainableCount
              }
            }
          }
        } catch (checkError) {
          console.warn('Plan sync check failed — skipping auto-removal', { checkError })
        }
      }

      // ── Step 2: Push locally-changed sessions to Intervals.icu ─────────────
      // Only push when there are pending local changes (changedSessions tracks edits
      // made in the app since the last save). If nothing changed locally, skip the push
      // entirely so we don't overwrite what the user may have changed in Intervals.icu.
      if (planAfterDeletions && (pendingLocalChanges.size > 0 || shouldForcePlanPush)) {
        const pendingCount = pendingLocalChanges.size
        try {
          const pushResponse = await fetch('/api/intervals/plans', {
            method: 'POST',
            headers: await buildIntervalsCredentialHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ mode: 'upsert', plan: planAfterDeletions }),
          })
          if (!pushResponse.ok) {
            const payload = (await pushResponse.json()) as { error?: string; details?: string }
            throw new Error(buildSyncErrorMessage(payload.error, payload.details))
          }

          const pushPayload = (await pushResponse.json()) as {
            success: boolean
            syncedEvents?: number
            attemptedSessions?: number
            failedSessions?: number
            error?: string
            details?: string
          }

          if (!pushPayload.success) {
            throw new Error(buildSyncErrorMessage(pushPayload.error, pushPayload.details))
          }

          if (pushPayload.failedSessions && pushPayload.failedSessions > 0) {
            throw new Error(
              `Plan sync incomplete: ${pushPayload.syncedEvents || 0}/${pushPayload.attemptedSessions || 0} synced (${pushPayload.failedSessions} failed)`
            )
          }

          {
            // Clear the pending-changes set after a successful push
            setChangedSessions(new Set())
            setPlanDiff(null)
            const syncedPlan = {
              ...planAfterDeletions,
              intervalsSync: {
                syncedAt: new Date().toISOString(),
              },
              updatedAt: new Date(),
            }
            await storage.updatePlan(syncedPlan.id, syncedPlan)
            setPlan(syncedPlan)
            setCurrentPlan(syncedPlan)
            const pushedCount = pendingCount > 0 ? pendingCount : (pushPayload.syncedEvents || missingRemoteSessionCount)
            syncAudit.pushedLocal = pushedCount

            if (shouldForcePlanPush && pendingCount === 0 && missingRemoteSessionCount > 0) {
              setSyncMessage(`Recovered ${missingRemoteSessionCount} missing remote session(s) before ride/profile sync.`)
            }
          }
        } catch (planPushError) {
          throw new Error(`Plan push failed: ${toErrorMessage(planPushError)}`)
        }
      }

      // ── Step 3: Sync rides / profile from Intervals.icu ─────────────────────
      const result = await syncIntervalsDelta(accessToken || 'intervals_connected', userProfile as UserProfile, true)

      if (!result.success) {
        throw new Error(result.error || 'Sync failed')
      }

      setIntervalsChanges(result.changes)
      setLastSyncTime(result.timestamp)
      setIntervalsSyncStatus('success')
      await loadRecentRideData()
      await refreshIntervalsInsightsSnapshot(userProfile.weight)

      const message =
        result.changes.length > 0
          ? `Synced: ${result.changes.map((item: { label: string }) => item.label).join(', ')}`
          : 'Synced: no profile changes detected'

      setSyncMessage(message)
      setLastSyncAudit(syncAudit)
      endTimer('intervals_sync', 'intervals_sync_completed', {
        source: 'manual',
        newRidesCount: result.newRidesCount,
        changesCount: result.changes.length,
      })

      trackMetric('intervals_new_rides', result.newRidesCount, 'count')

      if (result.afterProfile.ftp !== userProfile.ftp || result.afterProfile.maxHeartRate !== userProfile.maxHeartRate) {
        const ftpDelta =
          typeof result.afterProfile.ftp === 'number' && typeof userProfile.ftp === 'number'
            ? Math.abs(result.afterProfile.ftp - userProfile.ftp)
            : 0
        const hasMeaningfulFtpChange = ftpDelta >= 3

        const nextProfile: UserProfile = {
          ...(result.afterProfile as UserProfile),
          planName: userProfile.planName || result.afterProfile.planName,
          goal: (userProfile.goal || result.afterProfile.goal) as TrainingGoal,
          planStartDate: userProfile.planStartDate || result.afterProfile.planStartDate,
          desiredPlanWeeks: userProfile.desiredPlanWeeks || result.afterProfile.desiredPlanWeeks,
          ftpIncreaseTargetWatts: userProfile.ftpIncreaseTargetWatts ?? result.afterProfile.ftpIncreaseTargetWatts,
          intensityDistribution: userProfile.intensityDistribution || result.afterProfile.intensityDistribution || 'conservative',
          qualityPriority: userProfile.qualityPriority || result.afterProfile.qualityPriority || 'balanced',
          hardSessionsPerWeekCap: userProfile.hardSessionsPerWeekCap || result.afterProfile.hardSessionsPerWeekCap || 2,
          shortDayPreference: userProfile.shortDayPreference || result.afterProfile.shortDayPreference || 'mixed',
          dietPreference: userProfile.dietPreference || result.afterProfile.dietPreference || 'mediterranean',
          dailyCalorieTarget: userProfile.dailyCalorieTarget ?? result.afterProfile.dailyCalorieTarget,
          dailyProteinTargetGrams: userProfile.dailyProteinTargetGrams ?? result.afterProfile.dailyProteinTargetGrams,
          dailyCarbTargetGrams: userProfile.dailyCarbTargetGrams ?? result.afterProfile.dailyCarbTargetGrams,
          dailyFatTargetGrams: userProfile.dailyFatTargetGrams ?? result.afterProfile.dailyFatTargetGrams,
          availableTime: userProfile.availableTime || result.afterProfile.availableTime,
          equipment: userProfile.equipment || result.afterProfile.equipment,
          injuries: userProfile.injuries || result.afterProfile.injuries,
          hasPowerMeter: userProfile.hasPowerMeter ?? result.afterProfile.hasPowerMeter,
          updatedAt: new Date(),
        }

        setUserProfile(nextProfile)

        if (currentPlan && autoRetargetOnFtpSync && hasMeaningfulFtpChange) {
          const planRequest = {
            name: currentPlan.name,
            goal: currentPlan.goal,
            durationWeeks: currentPlan.durationWeeks,
            startDate: new Date(currentPlan.startDate),
            ftpIncreaseTargetWatts:
              nextProfile.ftpIncreaseTargetWatts ??
              currentPlan.targetMetrics.ftpIncreaseTargetWatts,
          }

          const intervalsInsights = await getIntervalsTrainingInsights(nextProfile.weight)
          setLatestIntervalsInsights(intervalsInsights)
          const blockedDates = await fetchIntervalsBlockedDates(
            formatDateInput(planRequest.startDate),
            formatDateInput(new Date(planRequest.startDate.getTime() + planRequest.durationWeeks * 7 * 24 * 60 * 60 * 1000))
          )

          const regeneratedPlan = generateTrainingPlan(
            currentPlan.userId,
            planRequest,
            buildAthletePlanContext(nextProfile),
            { intervalsInsights, blockedDates }
          )

          const cutoffDate = startOfDay(new Date())
          const retargetedPlan = mergeFutureSessionsFromPlan(currentPlan, regeneratedPlan, cutoffDate)
          let finalRetargetedPlan: TrainingPlan = {
            ...retargetedPlan,
            id: currentPlan.id,
            externalPlanId: currentPlan.externalPlanId,
            createdAt: currentPlan.createdAt,
            updatedAt: new Date(),
          }

          try {
            const response = await fetch('/api/intervals/plans', {
              method: 'POST',
              headers: await buildIntervalsCredentialHeaders({
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({ mode: 'replace', plan: finalRetargetedPlan }),
            })

            if (response.ok) {
              const payload = (await response.json()) as {
                success: boolean
                externalPlanId?: string
                syncedEvents?: number
                error?: string
                details?: string
              }

              if (payload.success) {
                finalRetargetedPlan = {
                  ...finalRetargetedPlan,
                  externalPlanId: payload.externalPlanId || finalRetargetedPlan.externalPlanId || finalRetargetedPlan.id,
                  intervalsSync: {
                    syncedAt: new Date().toISOString(),
                  },
                }
                setSyncMessage(
                  `Synced and retargeted future sessions to FTP ${nextProfile.ftp || 'N/A'} (${payload.syncedEvents || 0} workouts replaced)`
                )
              } else {
                setSyncMessage(`FTP updated locally; Intervals replace sync warning: ${buildSyncErrorMessage(payload.error, payload.details)}`)
              }
            } else {
              const payload = (await response.json()) as { error?: string; details?: string }
              setSyncMessage(`FTP updated locally; Intervals replace sync failed: ${buildSyncErrorMessage(payload.error, payload.details)}`)
            }
          } catch (error) {
            setSyncMessage(`FTP updated locally; Intervals replace sync failed: ${toErrorMessage(error)}`)
            console.error('Retarget replace sync failed', { error })
          }

          await storage.updatePlan(currentPlan.id, finalRetargetedPlan)
          setPlan(finalRetargetedPlan)
          setCurrentPlan(finalRetargetedPlan)
          setPlanDiff(null)
          setChangedSessions(new Set())
          await refreshStoredPlans()
        } else if (currentPlan && !autoRetargetOnFtpSync) {
          setSyncMessage('FTP updated from Intervals.icu. Auto-retarget is off, so planned future sessions were left unchanged.')
        } else if (currentPlan && autoRetargetOnFtpSync && !hasMeaningfulFtpChange) {
          setSyncMessage(`FTP updated by ${ftpDelta}W; below retarget threshold, so future sessions were left unchanged.`)
        }
      }
    } catch (error) {
      setIntervalsSyncStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed')
      trackEvent('intervals_sync_failed', {
        source: 'manual',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      console.error('Intervals sync failed', { error })
    }
  }, [
    accessToken,
    autoRetargetOnFtpSync,
    changedSessions,
    currentPlan,
    endTimer,
    loadRecentRideData,
    refreshIntervalsInsightsSnapshot,
    refreshStoredPlans,
    syncReconciliationMode,
    startTimer,
    trackEvent,
    trackMetric,
    userProfile,
  ])

  const syncPlanWithIntervals = useCallback(
    async (mode: PlanSyncMode, planToSync: TrainingPlan) => {
      const response = await fetch('/api/intervals/plans', {
        method: 'POST',
        headers: await buildIntervalsCredentialHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ mode, plan: planToSync }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string; details?: string }
        throw new Error(buildSyncErrorMessage(payload.error, payload.details))
      }

      return response.json() as Promise<{
        success: boolean
        externalPlanId?: string
        syncedEvents?: number
        deleted?: number
        subscriptionLimited?: boolean
        error?: string
        details?: string
      }>
    },
    []
  )

  const handleCreatePlan = useCallback(
    async (profile: Partial<UserProfile>) => {
      try {
        setLoading(true)
        startTimer('plan_creation')

        const userId = `user_${Date.now()}`
        const storedProfiles = await storage.loadProfiles()
        const latestStoredProfile = [...storedProfiles].sort((left, right) => {
          const leftUpdated = Number(new Date((left.updatedAt as unknown as Date) || left.createdAt || 0))
          const rightUpdated = Number(new Date((right.updatedAt as unknown as Date) || right.createdAt || 0))
          return rightUpdated - leftUpdated
        })[0]
        const athleteTemplate = buildAthleteProfileTemplate(userProfile || latestStoredProfile)
        let completeProfile: UserProfile = {
          ...athleteTemplate,
          id: userId,
          planName: profile.planName || buildDefaultPlanNameFromProfile(profile),
          goal: (profile.goal || 'ftp_increase') as TrainingGoal,
          intensityDistribution: profile.intensityDistribution || athleteTemplate.intensityDistribution || 'conservative',
          qualityPriority: profile.qualityPriority || athleteTemplate.qualityPriority || 'balanced',
          hardSessionsPerWeekCap: profile.hardSessionsPerWeekCap || athleteTemplate.hardSessionsPerWeekCap || 2,
          shortDayPreference: profile.shortDayPreference || athleteTemplate.shortDayPreference || 'mixed',
          dietPreference: profile.dietPreference || athleteTemplate.dietPreference || 'mediterranean',
          dailyCalorieTarget: profile.dailyCalorieTarget ?? athleteTemplate.dailyCalorieTarget,
          dailyProteinTargetGrams: profile.dailyProteinTargetGrams ?? athleteTemplate.dailyProteinTargetGrams,
          dailyCarbTargetGrams: profile.dailyCarbTargetGrams ?? athleteTemplate.dailyCarbTargetGrams,
          dailyFatTargetGrams: profile.dailyFatTargetGrams ?? athleteTemplate.dailyFatTargetGrams,
          planStartDate: profile.planStartDate || formatDateInput(new Date()),
          desiredPlanWeeks: profile.desiredPlanWeeks || 12,
          ftpIncreaseTargetWatts: profile.ftpIncreaseTargetWatts,
          createdAt: athleteTemplate.createdAt || new Date(),
          updatedAt: new Date(),
        }

        if (accessToken) {
          const syncResult = await syncIntervalsDelta(accessToken || 'intervals_connected', completeProfile, true)
          if (syncResult.success) {
            completeProfile = {
              ...syncResult.afterProfile,
              id: userId,
              planName: completeProfile.planName,
              goal: completeProfile.goal,
              planStartDate: completeProfile.planStartDate,
              desiredPlanWeeks: completeProfile.desiredPlanWeeks,
              ftpIncreaseTargetWatts: completeProfile.ftpIncreaseTargetWatts,
              intensityDistribution: completeProfile.intensityDistribution,
              qualityPriority: completeProfile.qualityPriority,
              hardSessionsPerWeekCap: completeProfile.hardSessionsPerWeekCap,
              shortDayPreference: completeProfile.shortDayPreference,
              dietPreference: completeProfile.dietPreference,
              dailyCalorieTarget: completeProfile.dailyCalorieTarget,
              dailyProteinTargetGrams: completeProfile.dailyProteinTargetGrams,
              dailyCarbTargetGrams: completeProfile.dailyCarbTargetGrams,
              dailyFatTargetGrams: completeProfile.dailyFatTargetGrams,
              availableTime: completeProfile.availableTime,
              equipment: completeProfile.equipment,
              injuries: completeProfile.injuries,
              hasPowerMeter: completeProfile.hasPowerMeter,
              createdAt: completeProfile.createdAt,
              updatedAt: new Date(),
            }
          }
        }

        setUserProfile(completeProfile)

        const planRequest = buildPlanRequest(completeProfile)
        const intervalsInsights = await getIntervalsTrainingInsights(completeProfile.weight)
        setLatestIntervalsInsights(intervalsInsights)
        const blockedDates = await fetchIntervalsBlockedDates(
          formatDateInput(planRequest.startDate),
          formatDateInput(new Date(planRequest.startDate.getTime() + planRequest.durationWeeks * 7 * 24 * 60 * 60 * 1000))
        )
        const generatedPlan = generateTrainingPlan(userId, planRequest, buildAthletePlanContext(completeProfile), {
          intervalsInsights,
          blockedDates,
        })
        let finalPlan = generatedPlan

        generatedPlan.mealSuggestions = await generateMealSuggestionsWithApi(generatedPlan.durationWeeks, {
          profile: completeProfile,
        })

        await storage.saveProfile(completeProfile)
        await storage.savePlan(generatedPlan, true)

        try {
          const syncResult = await syncPlanWithIntervals('upsert', generatedPlan)

          if (syncResult.success) {
            const syncedPlan: TrainingPlan = {
              ...generatedPlan,
              externalPlanId: syncResult.externalPlanId || generatedPlan.externalPlanId || generatedPlan.id,
              intervalsSync: {
                syncedAt: new Date().toISOString(),
              },
            }

            await storage.updatePlan(generatedPlan.id, syncedPlan)
            finalPlan = syncedPlan
            setSyncMessage(`Plan synced to Intervals.icu (${syncResult.syncedEvents || 0} workouts)`)
          } else if (syncResult.error) {
            setSyncMessage(buildSyncErrorMessage(syncResult.error, syncResult.details))
          }
        } catch (error) {
          const message = toErrorMessage(error)
          console.error('Initial Intervals plan sync failed', message)
          setSyncMessage(message)
        }

        setPlan(finalPlan)
        setCurrentPlan(finalPlan)
        setPlanDiff(null)
        setChangedSessions(new Set())
        await refreshStoredPlans()

        endTimer('plan_creation', 'plan_created', {
          goal: generatedPlan.goal,
          durationWeeks: generatedPlan.durationWeeks,
          hasPowerMeter: profile.hasPowerMeter || false,
        })

        trackEvent(profile.hasPowerMeter ? 'power_meter_enabled' : 'power_meter_disabled')

        if (intervalsCredentials && (await isIntervalsSyncNeeded())) {
          await performIntervalsSync()
        }
      } catch (error) {
        console.error('Failed to create plan', { error })
      } finally {
        setLoading(false)
      }
    },
    [endTimer, intervalsCredentials, performIntervalsSync, refreshStoredPlans, startTimer, syncPlanWithIntervals, trackEvent, userProfile]
  )

  const handleSelectPlan = useCallback(async (planId: string) => {
    const selectedPlan = await storage.loadPlan(planId)

    if (!selectedPlan) {
      return
    }

    const recoveredPlan = recoverCorruptedStoredPlan(selectedPlan)
    const existingProfile = await storage.loadProfile(recoveredPlan.userId)
    const activePlan = await repairCollapsedPlan(recoveredPlan, existingProfile || buildEditableProfile(recoveredPlan))
    if (activePlan !== selectedPlan.plan) {
      await storage.updatePlan(selectedPlan.id, activePlan)
    }

    setPlan(activePlan)
    setCurrentPlan(activePlan)
    setPlanDiff(null)
    setChangedSessions(new Set())
    const loadedProfile = await loadProfileForPlan(activePlan)
    await refreshIntervalsInsightsSnapshot(loadedProfile?.weight)
    setSyncMessage(activePlan !== selectedPlan.plan ? `Recovered plan ${activePlan.id} from original local snapshot` : `Loaded plan ${activePlan.id}`)
  }, [loadProfileForPlan, refreshIntervalsInsightsSnapshot, repairCollapsedPlan])

  const athleteSignature = latestIntervalsInsights?.athleteSignature
  const signatureBiasReasons = useMemo(() => deriveSignatureBiasReasons(athleteSignature), [athleteSignature])

  const handleDeletePlan = useCallback(
    async (planId: string) => {
      if (!window.confirm('Delete this plan permanently?')) {
        return
      }

      const selectedPlan = await storage.loadPlan(planId)
      let intervalsDeleteSucceeded = false

      if (selectedPlan?.plan) {
        try {
          const deleteResult = await syncPlanWithIntervals('delete', selectedPlan.plan)
          intervalsDeleteSucceeded = deleteResult.success
          if (deleteResult.success) {
            setSyncMessage(`Deleted plan from Intervals.icu (${deleteResult.deleted || 0} events removed)`)
          } else if (deleteResult.error) {
            setSyncMessage(`Warning: ${buildSyncErrorMessage(deleteResult.error, deleteResult.details)}`)
          }
        } catch (error) {
          const message = toErrorMessage(error)
          console.error('Failed to delete Intervals plan', message)
          setSyncMessage(`Warning: ${message}`)
        }
      }

      // Always delete locally, regardless of Intervals sync success
      await storage.deletePlan(planId)
      console.info(`Plan ${planId} deleted locally`, { intervalsDeleteSucceeded })

      // Refresh the stored plans list to update UI
      const plans = await refreshStoredPlans()

      if (plans.length === 0) {
        setPlan(null)
        setCurrentPlan(null)
        setUserProfile(null)
        setPlanDiff(null)
        setChangedSessions(new Set())
        setIntervalsChanges([])
        setLastSyncTime(null)
        setIntervalsSyncStatus('idle')
        setSyncMessage('No plans available. Create a new plan to get started.')
        return
      }

      if (currentPlan?.id === planId) {
        const nextPlan = plans[0]?.plan || null
        setPlan(nextPlan)
        setCurrentPlan(nextPlan)
        setPlanDiff(null)
        setChangedSessions(new Set())
        if (nextPlan) {
          await loadProfileForPlan(nextPlan)
        }
      }
    },
    [currentPlan, loadProfileForPlan, refreshStoredPlans, syncPlanWithIntervals]
  )

  const handleDuplicatePlan = useCallback(
    async (planId: string) => {
      try {
        setLoading(true)

        const selectedPlan = await storage.loadPlan(planId)
        if (!selectedPlan) {
          return
        }

        const sourcePlan = selectedPlan.plan
        const duplicatedUserId = `user_${Date.now()}`
        const duplicatedPlanId = `plan_${duplicatedUserId}_${Date.now()}`
        const sourceProfile = await storage.loadProfile(sourcePlan.userId)

        const duplicatedPlan: TrainingPlan = {
          ...sourcePlan,
          id: duplicatedPlanId,
          externalPlanId: duplicatedPlanId,
          userId: duplicatedUserId,
          name: buildDuplicatePlanName(sourcePlan.name, storedPlans.map((storedPlan) => storedPlan.plan.name)),
          intervalsSync: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          weeks: sourcePlan.weeks.map((week) => ({
            ...week,
            sessions: week.sessions.map((session) => ({
              ...session,
              id: `${session.id}_copy_${Date.now()}`,
              date: new Date(session.date),
            })),
          })),
          mealSuggestions: sourcePlan.mealSuggestions.map((meal) => ({ ...meal })),
        }

        const duplicatedProfile: UserProfile = sourceProfile
          ? {
              ...sourceProfile,
              id: duplicatedUserId,
              planName: duplicatedPlan.name,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : {
              id: duplicatedUserId,
              planName: duplicatedPlan.name,
              age: userProfile?.age || 35,
              height: userProfile?.height || 180,
              weight: userProfile?.weight || 75,
              goal: sourcePlan.goal,
              planStartDate: formatDateInput(sourcePlan.startDate),
              desiredPlanWeeks: sourcePlan.durationWeeks,
              ftpIncreaseTargetWatts: sourcePlan.targetMetrics.ftpIncreaseTargetWatts,
              injuries: userProfile?.injuries || [],
              equipment: userProfile?.equipment || [],
              hasPowerMeter: userProfile?.hasPowerMeter || false,
              intensityDistribution: userProfile?.intensityDistribution || 'conservative',
              qualityPriority: userProfile?.qualityPriority || 'balanced',
              hardSessionsPerWeekCap: userProfile?.hardSessionsPerWeekCap || 2,
              shortDayPreference: userProfile?.shortDayPreference || 'mixed',
              dietPreference: userProfile?.dietPreference || 'mediterranean',
              dailyCalorieTarget: userProfile?.dailyCalorieTarget,
              dailyProteinTargetGrams: userProfile?.dailyProteinTargetGrams,
              dailyCarbTargetGrams: userProfile?.dailyCarbTargetGrams,
              dailyFatTargetGrams: userProfile?.dailyFatTargetGrams,
              availableTime: userProfile?.availableTime || {},
              ftp: userProfile?.ftp,
              maxHeartRate: userProfile?.maxHeartRate,
              createdAt: new Date(),
              updatedAt: new Date(),
            }

        await storage.saveProfile(duplicatedProfile)
        await storage.savePlan(duplicatedPlan, true)

        setPlan(duplicatedPlan)
        setCurrentPlan(duplicatedPlan)
        setUserProfile(duplicatedProfile)
        setPlanDiff(null)
        setChangedSessions(new Set())
        await refreshStoredPlans()
        setSyncMessage(`Duplicated plan as "${duplicatedPlan.name}". This copy was kept local until you choose to save changes.`)
      } catch (error) {
        console.error('Failed to duplicate plan', { error })
        setSyncMessage(error instanceof Error ? error.message : 'Failed to duplicate plan')
      } finally {
        setLoading(false)
      }
    },
    [refreshStoredPlans, storedPlans, userProfile]
  )

  const handleSessionChange = useCallback(
    (weekNumber: number, dayOfWeek: number, updatedSession: TrainingSession) => {
      if (!currentPlan) {
        return
      }

      const updatedDate = getSessionDate(currentPlan.startDate, weekNumber, dayOfWeek)
      const normalizedSession: TrainingSession = {
        ...updatedSession,
        dayOfWeek,
        date: updatedDate,
        localUpdatedAt: new Date().toISOString(),
      }

      const nextPlan: TrainingPlan = {
        ...currentPlan,
        weeks: currentPlan.weeks.map((week) => {
          if (week.weekNumber !== weekNumber) {
            return week
          }

          const nextSessions = upsertSessionByDay(week.sessions, dayOfWeek, normalizedSession)

          return {
            ...week,
            sessions: nextSessions,
            totalHours: nextSessions.reduce((sum, session) => sum + session.duration / 60, 0),
          }
        }),
      }

      setCurrentPlan(nextPlan)

      const sessionKey = `${weekNumber}-${dayOfWeek}`
      setChangedSessions((prev) => new Set(prev).add(sessionKey))

      if (plan) {
        setPlanDiff(comparePlans(plan, nextPlan))
      }

      trackEvent('session_edited', {
        weekNumber,
        dayOfWeek,
        sessionType: updatedSession.type,
      })
    },
    [currentPlan, plan, trackEvent]
  )

  const handleSessionMove = useCallback(
    (
      source: { weekNumber: number; dayOfWeek: number },
      target: { weekNumber: number; dayOfWeek: number }
    ) => {
      if (!currentPlan) {
        return
      }

      const sourceWeek = currentPlan.weeks.find((week) => week.weekNumber === source.weekNumber)
      const targetWeek = currentPlan.weeks.find((week) => week.weekNumber === target.weekNumber)

      if (!sourceWeek || !targetWeek) {
        return
      }

      const sourceSession = sourceWeek.sessions.find((session) => session.dayOfWeek === source.dayOfWeek)
      if (!sourceSession) {
        return
      }

      const targetSession = targetWeek.sessions.find((session) => session.dayOfWeek === target.dayOfWeek)
      const updatedAt = new Date().toISOString()

      const movedSource: TrainingSession = {
        ...sourceSession,
        dayOfWeek: target.dayOfWeek,
        date: getSessionDate(currentPlan.startDate, target.weekNumber, target.dayOfWeek),
        localUpdatedAt: updatedAt,
      }

      const replacementForSource = targetSession
        ? {
            ...targetSession,
            dayOfWeek: source.dayOfWeek,
            date: getSessionDate(currentPlan.startDate, source.weekNumber, source.dayOfWeek),
            localUpdatedAt: updatedAt,
          }
        : {
            ...createRestDaySession(source.weekNumber, source.dayOfWeek, getSessionDate(currentPlan.startDate, source.weekNumber, source.dayOfWeek)),
            localUpdatedAt: updatedAt,
          }

      const nextPlan: TrainingPlan = {
        ...currentPlan,
        weeks: currentPlan.weeks.map((week) => {
          if (week.weekNumber === source.weekNumber && week.weekNumber === target.weekNumber) {
            const swapped = upsertSessionByDay(
              upsertSessionByDay(week.sessions, source.dayOfWeek, replacementForSource),
              target.dayOfWeek,
              movedSource
            )

            return {
              ...week,
              sessions: swapped,
              totalHours: swapped.reduce((sum, session) => sum + session.duration / 60, 0),
            }
          }

          if (week.weekNumber === source.weekNumber) {
            const sourceUpdated = upsertSessionByDay(week.sessions, source.dayOfWeek, replacementForSource)
            return {
              ...week,
              sessions: sourceUpdated,
              totalHours: sourceUpdated.reduce((sum, session) => sum + session.duration / 60, 0),
            }
          }

          if (week.weekNumber === target.weekNumber) {
            const targetUpdated = upsertSessionByDay(week.sessions, target.dayOfWeek, movedSource)
            return {
              ...week,
              sessions: targetUpdated,
              totalHours: targetUpdated.reduce((sum, session) => sum + session.duration / 60, 0),
            }
          }

          return week
        }),
      }

      setCurrentPlan(nextPlan)
      setChangedSessions((prev) => {
        const next = new Set(prev)
        next.add(`${source.weekNumber}-${source.dayOfWeek}`)
        next.add(`${target.weekNumber}-${target.dayOfWeek}`)
        return next
      })

      if (plan) {
        setPlanDiff(comparePlans(plan, nextPlan))
      }

      trackEvent('session_edited', {
        sourceWeek: source.weekNumber,
        sourceDayOfWeek: source.dayOfWeek,
        targetWeek: target.weekNumber,
        targetDayOfWeek: target.dayOfWeek,
      })
    },
    [currentPlan, plan, trackEvent]
  )

  const handleEditSession = useCallback((weekNumber: number, dayOfWeek: number, session: TrainingSession) => {
    setSessionModalMode('edit')
    setEditingSession({ weekNumber, dayOfWeek, session })
    setEditorOpen(true)
  }, [])

  const handleViewSession = useCallback((weekNumber: number, dayOfWeek: number, session: TrainingSession) => {
    setSessionModalMode('view')
    setEditingSession({ weekNumber, dayOfWeek, session })
    setEditorOpen(true)
  }, [])

  const handleSaveSession = useCallback(
    (updatedSession: TrainingSession) => {
      if (!editingSession) {
        return
      }

      handleSessionChange(editingSession.weekNumber, editingSession.dayOfWeek, updatedSession)
      setEditorOpen(false)
      setEditingSession(null)
    },
    [editingSession, handleSessionChange]
  )

  const handleSavePlan = useCallback(async () => {
    if (!plan || !currentPlan) {
      return
    }

    startTimer('plan_save')

    try {
      let updatedPlan = currentPlan

      try {
        const syncResult = await syncPlanWithIntervals('replace', currentPlan)
        if (syncResult.success) {
          updatedPlan = {
            ...currentPlan,
            externalPlanId: syncResult.externalPlanId || currentPlan.externalPlanId || currentPlan.id,
            intervalsSync: {
              syncedAt: new Date().toISOString(),
            },
          }
        } else if (syncResult.error) {
          setSyncMessage(buildSyncErrorMessage(syncResult.error, syncResult.details))
        }
      } catch (error) {
        setSyncMessage(toErrorMessage(error))
        console.error('Failed to update Intervals plan', toErrorMessage(error))
      }

      await storage.updatePlan(currentPlan.id, updatedPlan)

      setPlan(updatedPlan)
      setCurrentPlan(updatedPlan)
      setPlanDiff(null)
      setChangedSessions(new Set())
      setSyncMessage('Plan saved')
      await refreshStoredPlans()
      endTimer('plan_save', 'plan_saved', { changedSessions: changedSessions.size })
    } catch (error) {
      console.error('Failed to save plan', { error })
    }
  }, [changedSessions.size, currentPlan, endTimer, plan, refreshStoredPlans, startTimer, syncPlanWithIntervals])

  const handleResetPlan = useCallback(() => {
    if (!plan) {
      return
    }

    setCurrentPlan(plan)
    setPlanDiff(null)
    setChangedSessions(new Set())
  }, [plan])

  const handleOpenForPrint = useCallback(() => {
    if (!currentPlan) {
      return
    }

    try {
      openPlanForPrint('training-plan-display')
      trackEvent('plan_exported', { format: 'print' })
    } catch (error) {
      setSyncMessage(`Could not open print view: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setIntervalsSyncStatus('error')
    }
  }, [currentPlan, trackEvent])

  const handleExportCSV = useCallback(() => {
    if (!currentPlan) {
      return
    }

    const csv = exportPlanToCSV(currentPlan)
    downloadCSV(csv, 'cycling-training-plan.csv')
    trackEvent('plan_exported', { format: 'csv' })
  }, [currentPlan, trackEvent])

  const handleExportGoogleCalendar = useCallback(() => {
    if (!currentPlan) {
      return
    }

    const ics = exportPlanToICS(currentPlan)
    downloadICS(ics, 'cycling-training-plan-google-calendar.ics')
    trackEvent('plan_exported', { format: 'ics' })
  }, [currentPlan, trackEvent])

  const handleExportGarmin = useCallback(async () => {
    if (!currentPlan) {
      return
    }

    const zipBlob = await exportPlanWorkoutBundleZip(currentPlan)
    const zipName = `cycling-training-workouts-${currentPlan.id}.zip`
    const url = URL.createObjectURL(zipBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = zipName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    const workoutCount = currentPlan.weeks.reduce((sum, week) => sum + week.sessions.length, 0)
    setSyncMessage(`Exported workout bundle ZIP with ${workoutCount} sessions + Garmin guide`)
    setIntervalsSyncStatus('success')

    trackEvent('plan_exported', {
      format: 'garmin_zwo_zip',
      workoutsExported: workoutCount,
    })
  }, [currentPlan, trackEvent])

  const renderPlanLibrary = () => (
    <div className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <div>
          <h2>Saved Plans</h2>
          <p className={styles.sectionHint}>Named plans stay listed here so you can open or delete them without losing track of the calendar.</p>
        </div>
      </div>
      <div className={styles.savedPlansList}>
        {storedPlans.map((storedPlan) => (
          <div
            key={storedPlan.id}
            className={clsx(styles.savedPlanCard, currentPlan?.id === storedPlan.id && styles.savedPlanCardActive)}
          >
            <div>
              <strong>{storedPlan.plan.name}</strong>
              <p>Goal: {storedPlan.plan.goal.replace('_', ' ')}</p>
              <p>Start: {formatDateInput(storedPlan.plan.startDate)} • {storedPlan.plan.durationWeeks} weeks</p>
              <p>Updated: {new Date(storedPlan.updatedAt).toLocaleString()}</p>
            </div>
            <div className={styles.savedPlanActions}>
              <button className={styles.syncBtn} onClick={() => handleSelectPlan(storedPlan.id)}>
                {currentPlan?.id === storedPlan.id ? 'Open Now' : 'Open'}
              </button>
              <button className={styles.syncBtn} onClick={() => handleDuplicatePlan(storedPlan.id)}>
                Duplicate
              </button>
              <button className={styles.syncBtn} onClick={() => handleDeletePlan(storedPlan.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (currentPlan) {
    return (
      <div className={styles.container}>
        <div className={styles.planHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.planTitleBlock}>
              <h1 title={currentPlan.name}>{currentPlan.name}</h1>
              <p title={`${currentPlan.durationWeeks} weeks • ${currentPlan.goal.replace('_', ' ')}`}>
                {currentPlan.durationWeeks} weeks • {currentPlan.goal.replace('_', ' ')}
              </p>
            </div>
            <section className={styles.plannerStrategyCard} aria-label="Planner strategy summary">
              <h3>Planner Strategy</h3>
              <div className={styles.plannerStrategyChips}>
                <span
                  className={clsx(
                    styles.strategyChip,
                    plannerStrategySummary.qualityPriority === 'conservative' && styles.strategyChipConservative,
                    plannerStrategySummary.qualityPriority === 'balanced' && styles.strategyChipBalanced,
                    plannerStrategySummary.qualityPriority === 'aggressive' && styles.strategyChipAggressive
                  )}
                >
                  Priority: {plannerStrategySummary.qualityPriorityLabel}
                </span>
                <span
                  className={clsx(
                    styles.strategyChip,
                    plannerStrategySummary.hardSessionCap === 1 && styles.strategyChipLowCap,
                    plannerStrategySummary.hardSessionCap === 2 && styles.strategyChipMediumCap,
                    plannerStrategySummary.hardSessionCap === 3 && styles.strategyChipHighCap
                  )}
                >
                  Hard cap: {plannerStrategySummary.hardSessionCap}/week
                </span>
                <span
                  className={clsx(
                    styles.strategyChip,
                    plannerStrategySummary.shortDayPreference === 'mixed' && styles.strategyChipMixed,
                    plannerStrategySummary.shortDayPreference === 'vo2_micro' && styles.strategyChipVo2,
                    plannerStrategySummary.shortDayPreference === 'threshold_blocks' && styles.strategyChipThreshold,
                    plannerStrategySummary.shortDayPreference === 'strength_focus' && styles.strategyChipStrength
                  )}
                >
                  Short days: {plannerStrategySummary.shortDayPreferenceLabel}
                </span>
              </div>
            </section>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.syncStatus}>
              <span className={styles.syncLabel}>
                {lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}` : 'Not synced yet'}
              </span>
              <button onClick={performIntervalsSync} disabled={intervalsSyncStatus === 'syncing'} className={styles.syncBtn}>
                {intervalsSyncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
              </button>
              <button onClick={isRunning ? stopSync : startSync} className={styles.syncBtn}>
                {isRunning ? 'Stop Auto Sync' : 'Start Auto Sync'}
              </button>

              <details className={styles.headerActionsMenu}>
                <summary className={styles.syncBtn}>Actions</summary>
                <div className={styles.headerActionsPanel}>
                  <Link className={styles.syncBtn} href={`/profile?planId=${currentPlan.id}`}>
                    Profile
                  </Link>

                  <label className={styles.compactActionField}>
                    <span>Plan</span>
                    <select className={styles.planSelect} value={currentPlan.id} onChange={(event) => handleSelectPlan(event.target.value)}>
                      {storedPlans.map((storedPlan) => (
                        <option key={storedPlan.id} value={storedPlan.id}>
                          {storedPlan.plan.name} - {new Date(storedPlan.updatedAt).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.compactActionField}>
                    <span>Sync mode</span>
                    <select
                      className={styles.syncModeSelect}
                      value={syncReconciliationMode}
                      onChange={(event) => setSyncReconciliationMode(event.target.value as SyncReconciliationMode)}
                    >
                      <option value="conservative">Conservative (no auto-delete local sessions)</option>
                      <option value="strict_mirror">Strict mirror (apply remote deletions)</option>
                    </select>
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={autoRetargetOnFtpSync}
                      onChange={(event) => setAutoRetargetOnFtpSync(event.target.checked)}
                    />
                    <span>Auto-update future sessions when FTP changes from Intervals sync</span>
                  </label>

                  <button onClick={() => handleDuplicatePlan(currentPlan.id)} className={styles.syncBtn}>
                    Duplicate Plan
                  </button>
                  <button onClick={() => handleDeletePlan(currentPlan.id)} className={styles.syncBtn}>
                    Delete Plan
                  </button>
                </div>
              </details>
            </div>

            {syncMessage && <div className={clsx(styles.syncMessage, styles[intervalsSyncStatus])}>{syncMessage}</div>}

            {lastSyncAudit && (
              <div className={styles.syncAuditCard}>
                <div className={styles.syncAuditHeader}>
                  <strong>Last Sync Decisions</strong>
                  <span>{new Date(lastSyncAudit.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className={styles.syncAuditGrid}>
                  <p>Remote deletions applied: {lastSyncAudit.remoteDeleted}</p>
                  <p>Remote updates pulled: {lastSyncAudit.remoteUpdated}</p>
                  <p>Local edits kept: {lastSyncAudit.localKept}</p>
                  <p>Local edits pushed: {lastSyncAudit.pushedLocal}</p>
                  <p>Remote deletions deferred: {lastSyncAudit.deferredRemoteDeletes}</p>
                </div>
              </div>
            )}

          </div>
        </div>

        {intervalsChanges.length > 0 && (
          <div className={styles.changesAlert}>
            <h3>Detected Intervals.icu Changes</h3>
            <ul>
              {intervalsChanges.map((change, index) => (
                <li key={`${change.type}-${index}`}>
                  {change.label} ({Math.round(change.confidence * 100)}%)
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2>Create Another Plan</h2>
              <p className={styles.sectionHint}>Start a new plan in a separate flow without mixing creation controls into the active plan workspace.</p>
            </div>
            <button onClick={() => setCurrentPlan(null)} className={styles.syncBtn}>
              Open Create Plan
            </button>
          </div>
        </section>

        {renderPlanLibrary()}

        <nav className={styles.workspaceTabBar} aria-label="Plan workspace sections">
          {(['today', 'calendar', 'season', 'summary', 'analytics', 'exports'] as const).map((tab) => {
            const LABELS: Record<typeof tab, string> = {
              today: 'Today',
              calendar: 'Calendar',
              season: 'Season',
              summary: 'Summary',
              analytics: 'Analytics',
              exports: 'Exports',
            }
            return (
              <button
                key={tab}
                type="button"
                className={clsx(styles.workspaceTab, activeWorkspaceTab === tab && styles.workspaceTabActive)}
                onClick={() => setActiveWorkspaceTab(tab)}
                aria-selected={activeWorkspaceTab === tab}
              >
                <span className={styles.workspaceTabIcon}>
                  {tab === 'today' && <SunIcon size={18} />}
                  {tab === 'calendar' && <CalendarIcon size={18} />}
                  {tab === 'season' && <LayersIcon size={18} />}
                  {tab === 'summary' && <CompassIcon size={18} />}
                  {tab === 'analytics' && <ChartIcon size={18} />}
                  {tab === 'exports' && <DownloadIcon size={18} />}
                </span>
                <span className={styles.workspaceTabLabel}>{LABELS[tab]}</span>
              </button>
            )
          })}
        </nav>

        {/* Today tab — daily nutrition guide */}
        {activeWorkspaceTab === 'today' && (
          <div className={styles.tabContent}>
            <DailyNutritionGuide plan={currentPlan} meals={currentPlan.mealSuggestions} />
          </div>
        )}

        {/* Calendar tab */}
        {activeWorkspaceTab === 'calendar' && (
          <div className={styles.tabContent}>
            {planDiff && hasChanges && (
              <div className={styles.changeSummary}>
                <h3>Pending Changes</h3>
                <p>{getChangeSummary(planDiff)}</p>
                <div className={styles.changeActions}>
                  <button onClick={handleResetPlan} className={styles.btnReset}>Reset</button>
                  <button onClick={handleSavePlan} className={styles.btnSave}>Save Changes</button>
                </div>
              </div>
            )}
            <div className={styles.calendarSection}>
              <div className={styles.calendarHeader}>
                <h2>Training Calendar</h2>
                <button
                  type="button"
                  className={styles.zonePillBtn}
                  onClick={() => setZoneWizardOpen(true)}
                  title="Configure training zones"
                >
                  ⚡ {activeZoneProfile ? `Zones: ${activeZoneProfile.ftp}W FTP` : 'Configure Zones'}
                </button>
              </div>
              <TrainingCalendar
                plan={currentPlan}
                onSessionChange={handleSessionChange}
                onSessionMove={handleSessionMove}
                onSessionEdit={handleEditSession}
                onSessionView={handleViewSession}
                onSessionLog={(weekNumber, _dayOfWeek, session) => setCompletionModalSession({ session, weekNumber })}
                completions={planCompletions}
                zoneProfile={activeZoneProfile ?? undefined}
                matchedRides={matchedRides}
                readinessEntry={todayReadiness}
                changedSessions={changedSessions}
                highlightSession={sessionHighlightMatcher}
                highlightEnabled={Boolean(activeCoachActionKey)}
                highlightPulseToken={coachActionPulseToken}
                fatigueRiskByDate={calendarFatigueRiskByDate}
                fatigueDetailsByDate={calendarFatigueDetailsByDate}
                plannedEvents={userProfile?.plannedEvents || []}
                autoScrollToTodaySignal={calendarAutoScrollSignal}
              />
            </div>
          </div>
        )}

        {/* Season tab */}
        {activeWorkspaceTab === 'season' && (
          <div className={styles.tabContent}>
            <SeasonPlanner
              storedPlans={storedPlans}
              currentPlanId={currentPlan.id}
              plannedEvents={userProfile?.plannedEvents || []}
              onSelectPlan={(planId) => {
                void handleSelectPlan(planId)
              }}
            />
          </div>
        )}

        {/* Analytics tab */}
        {activeWorkspaceTab === 'analytics' && (
          <div className={styles.tabContent}>
            <BodyMetricsLog
              entries={bodyMetrics}
              defaultWeightKg={typeof userProfile?.weight === 'number' ? userProfile.weight : undefined}
              defaultRestingHr={typeof userProfile?.maxHeartRate === 'number' ? Math.round(userProfile.maxHeartRate * 0.34) : undefined}
              onSave={async (entry) => {
                await storage.saveBodyMetrics(entry)
                const next = await storage.getBodyMetrics()
                setBodyMetrics(next)
              }}
            />
            <PerformanceCharts
              plan={currentPlan}
              ftpTargetOverride={effectiveFtpTarget}
              intervalsRideData={intervalsRideData}
              bodyMetrics={bodyMetrics}
              plannedEvents={userProfile?.plannedEvents || []}
              onCoachActionSelect={handleCoachActionSelect}
            />
            <AnalyticsDashboard />
          </div>
        )}

        {/* Plan Summary tab */}
        {activeWorkspaceTab === 'summary' && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h2>Plan Summary</h2>
              <p className={styles.summaryIntro}>Plan inputs define what gets scheduled. Athlete details describe the rider and only affect the plan when training targets need to adapt.</p>
              <div className={styles.summary}>
                <section className={`${styles.summaryCard} ${styles.planInputsCard}`}>
                  <div className={styles.summaryCardHeader}>
                    <span className={styles.summaryEyebrow}>Drives The Schedule</span>
                    <h4>Plan Inputs</h4>
                    <p>These fields decide the training objective, start date, and time horizon for the block.</p>
                  </div>
                  <dl className={styles.summaryDetails}>
                    <div><dt>Name</dt><dd>{currentPlan.name}</dd></div>
                    <div><dt>Goal</dt><dd>{userProfile?.goal?.replace('_', ' ')}</dd></div>
                    <div><dt>Plan start</dt><dd>{formatDateInput(currentPlan.startDate)}</dd></div>
                    <div><dt>Timeframe</dt><dd>{userProfile?.desiredPlanWeeks || currentPlan.durationWeeks} weeks</dd></div>
                    <div><dt>FTP gain target</dt><dd>{ftpGainTargetLabel}</dd></div>
                    <div><dt>Intensity distribution</dt><dd>{(userProfile?.intensityDistribution || 'conservative').charAt(0).toUpperCase() + (userProfile?.intensityDistribution || 'conservative').slice(1)}</dd></div>
                    <div><dt>Quality priority</dt><dd>{plannerStrategySummary.qualityPriorityLabel}</dd></div>
                    <div><dt>Hard sessions cap</dt><dd>{plannerStrategySummary.hardSessionCap} per week</dd></div>
                    <div><dt>Short-day focus</dt><dd>{plannerStrategySummary.shortDayPreferenceLabel}</dd></div>
                  </dl>
                </section>
                <section className={`${styles.summaryCard} ${styles.planMetricsCard}`}>
                  <h4>Plan Metrics</h4>
                  <ul>
                    <li>Duration: {currentPlan.durationWeeks} weeks</li>
                    <li>Total sessions: {currentPlan.weeks.reduce((sum, week) => sum + week.sessions.length, 0)}</li>
                    <li>Total hours: {currentPlan.weeks.reduce((sum, week) => sum + week.totalHours, 0).toFixed(1)}</li>
                    <li>FTP target: {effectiveFtpTarget || 'N/A'}</li>
                    <li>Baseline FTP used: {ftpSourceDetails.baselineFtp ?? 'N/A'}</li>
                    <li>FTP source: {ftpSourceDetails.source}</li>
                    <li>Climbing W/kg: {currentPlan.targetMetrics.climbingWattsPerKg || 'N/A'}</li>
                  </ul>
                </section>
                <section className={`${styles.summaryCard} ${styles.signatureCard}`}>
                  <h4>Athlete Signature</h4>
                  {athleteSignature ? (
                    <>
                      <ul>
                        <li>Sustained power: {Math.round(athleteSignature.sustainedPowerFraction * 100)}% FTP</li>
                        <li>VO2 profile: {Math.round(athleteSignature.powerDurationProfile.vo2PowerFraction * 100)}% FTP</li>
                        <li>Threshold profile: {Math.round(athleteSignature.powerDurationProfile.thresholdPowerFraction * 100)}% FTP</li>
                        <li>Endurance decoupling: {athleteSignature.enduranceDecouplingScore.toFixed(2)}</li>
                      </ul>
                      <p className={styles.signatureTitle}>Planner bias</p>
                      <ul>
                        {signatureBiasReasons.map((reason) => (<li key={reason}>{reason}</li>))}
                      </ul>
                    </>
                  ) : (
                    <p className={styles.summaryCardNote}>No ride signature yet. Sync Intervals rides to enable this.</p>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Exports tab */}
        {activeWorkspaceTab === 'exports' && (
          <div className={styles.tabContent}>
            <section className={styles.section}>
              <h2>Exports</h2>
              <p className={styles.sectionHint}>Download or print your current plan.</p>
              <div className={styles.exportActionsGrid}>
                <button onClick={handleOpenForPrint} className={clsx(styles.syncBtn, styles.exportActionBtn)}>
                  <span aria-hidden="true" className={styles.exportActionIcon}><PrinterIcon size={18} /></span>
                  <span>
                    <strong>Print / Save as PDF</strong>
                    <small>Opens plan in new tab — print or save via browser</small>
                  </span>
                </button>
                <button onClick={handleExportCSV} className={clsx(styles.syncBtn, styles.exportActionBtn)}>
                  <span aria-hidden="true" className={styles.exportActionIcon}><TableIcon size={18} /></span>
                  <span>
                    <strong>Export CSV</strong>
                    <small>Spreadsheet-friendly table</small>
                  </span>
                </button>
                <button onClick={handleExportGoogleCalendar} className={clsx(styles.syncBtn, styles.exportActionBtn)}>
                  <span aria-hidden="true" className={styles.exportActionIcon}><CalendarIcon size={18} /></span>
                  <span>
                    <strong>Export ICS</strong>
                    <small>Import to calendar apps</small>
                  </span>
                </button>
                <button onClick={handleExportGarmin} className={clsx(styles.syncBtn, styles.exportActionBtn)}>
                  <span aria-hidden="true" className={styles.exportActionIcon}><LayersIcon size={18} /></span>
                  <span>
                    <strong>Garmin/Zwift Bundle</strong>
                    <small>ZIP with workouts + guide</small>
                  </span>
                </button>

              </div>
            </section>
          </div>
        )}

        {/* Session editor modal — always rendered regardless of active tab */}
        {editorOpen && editingSession && plan && (
          <SessionEditorModal
            session={editingSession.session}
            originalSession={
              plan.weeks
                .find((week) => week.weekNumber === editingSession.weekNumber)
                ?.sessions.find((session) => session.dayOfWeek === editingSession.dayOfWeek) || editingSession.session
            }
            onSave={handleSaveSession}
            onCancel={() => {
              setEditorOpen(false)
              setEditingSession(null)
            }}
            mode={sessionModalMode}
            onSwitchToEdit={() => setSessionModalMode('edit')}
            weekNumber={editingSession.weekNumber}
            dayIndex={editingSession.dayOfWeek - 1}
            hasPowerMeter={Boolean(userProfile?.hasPowerMeter)}
            profileEquipment={userProfile?.equipment || []}
            zoneVersionOptions={zoneVersionOptions}
          />
        )}

        <div className={styles.printSourceHidden} aria-hidden="true">
          <TrainingPlanDisplay plan={currentPlan} onExportCSV={handleExportCSV} onPrint={handleOpenForPrint} />
        </div>

        {/* Completion / RPE log modal */}
        {completionModalSession && currentPlan && (
          <SessionCompletionModal
            session={completionModalSession.session}
            planId={currentPlan.id}
            existingCompletion={planCompletions.get(completionModalSession.session.id)}
            onSave={handleSaveCompletion}
            onDelete={planCompletions.has(completionModalSession.session.id)
              ? () => handleDeleteCompletion(completionModalSession.session.id)
              : undefined}
            onCancel={() => setCompletionModalSession(null)}
          />
        )}

        {/* Zone wizard modal */}
        {zoneWizardOpen && (
          <ZoneWizard
            existingProfile={activeZoneProfile ?? undefined}
            defaultFtp={userProfile?.ftp}
            defaultMaxHR={userProfile?.maxHeartRate}
            onSave={handleSaveZoneProfile}
            onCancel={() => setZoneWizardOpen(false)}
          />
        )}
      </div>
    )
  }
  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1>Cycling AI Training Plans</h1>
        <p>Create personalized training plans integrated with Intervals.icu ride data.</p>
        <div className={styles.heroActions}>
          <Link className={styles.syncBtn} href="/profile">
            Open Athlete Profile
          </Link>
        </div>
      </div>

      <div className={styles.features}>
        <div className={styles.feature}>
          <span className={styles.icon}>Personalized</span>
          <h3>Adaptive Plan</h3>
          <p>Generate a structured plan based on your availability, goals, and equipment.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.icon}>Intervals</span>
          <h3>Auto Sync</h3>
          <p>Sync changes from Intervals.icu and keep your progression metrics updated automatically.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.icon}>Insights</span>
          <h3>Analytics</h3>
          <p>Track edits, sync behavior, and exported artifacts through the dashboard.</p>
        </div>
      </div>

      <UserProfileForm
        key={`plan-create-${userProfile?.id || 'default'}-${new Date((userProfile?.updatedAt as unknown as string | number | Date) || 0).getTime()}`}
        onSubmit={handleCreatePlan}
        loading={loading}
        initialProfile={buildPlanCreationDraft(userProfile)}
        title="Create New Plan"
        submitLabel="Create Training Plan"
        showPlanInputs={true}
        showAthleteDetails={false}
      />

      {storedPlans.length === 0 && (
        <div className={styles.section}>
          <h2>No Plans Yet</h2>
          <p>Create your first plan above. Once saved, it will appear here and can be synced with Intervals.icu.</p>

          {showBackupPlans && backupPlans.length > 0 && (
            <div className={styles.backupPlansSection}>
              <h3>Recover Plans from Intervals.icu</h3>
              <p>Found {backupPlans.length} plan(s) previously synced to Intervals.icu. Restore any to continue:</p>
              <div className={styles.backupPlansList}>
                {backupPlans.map((backupPlan) => (
                  <div key={backupPlan.id} className={styles.backupPlanCard}>
                    <div>
                      <strong>{backupPlan.name}</strong>
                      <p>Goal: {backupPlan.goal.replace(/_/g, ' ')}</p>
                      <p>Duration: {backupPlan.durationWeeks} weeks</p>
                      <p>Sessions: {backupPlan.weeks.reduce((sum, w) => sum + w.sessions.length, 0)} total</p>
                    </div>
                    <button
                      className={styles.restoreBtn}
                      onClick={() => restoreBackupPlan(backupPlan)}
                      disabled={loading}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {storedPlans.length > 0 && (
        renderPlanLibrary()
      )}
    </div>
  )
}

function getSessionDate(planStartDate: Date, weekNumber: number, dayOfWeek: number): Date {
  const date = new Date(planStartDate)
  date.setDate(date.getDate() + (weekNumber - 1) * 7 + (dayOfWeek - 1))
  return date
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function isOnOrAfter(dateValue: Date | string, cutoff: Date): boolean {
  const normalized = dateValue instanceof Date ? dateValue : new Date(dateValue)
  return normalized.getTime() >= cutoff.getTime()
}

function mergeFutureSessionsFromPlan(basePlan: TrainingPlan, regeneratedPlan: TrainingPlan, cutoffDate: Date): TrainingPlan {
  const mergedWeeks = basePlan.weeks.map((baseWeek, weekIndex) => {
    const regeneratedWeek = regeneratedPlan.weeks[weekIndex]

    if (!regeneratedWeek) {
      return baseWeek
    }

    const mergedSessions = baseWeek.sessions.map((baseSession) => {
      if (!isOnOrAfter(baseSession.date, cutoffDate)) {
        return baseSession
      }

      const replacement = regeneratedWeek.sessions.find((candidate) => candidate.dayOfWeek === baseSession.dayOfWeek)
      if (!replacement) {
        return baseSession
      }

      return {
        ...replacement,
        id: baseSession.id,
      }
    })

    return {
      ...baseWeek,
      phase: regeneratedWeek.phase,
      focusPoints: regeneratedWeek.focusPoints,
      sessions: mergedSessions,
      totalHours: mergedSessions.reduce((sum, session) => sum + session.duration / 60, 0),
    }
  })

  return {
    ...basePlan,
    weeks: mergedWeeks,
    targetMetrics: regeneratedPlan.targetMetrics,
    mealSuggestions: regeneratedPlan.mealSuggestions,
    updatedAt: new Date(),
  }
}

function upsertSessionByDay(
  sessions: TrainingSession[],
  dayOfWeek: number,
  session: TrainingSession
): TrainingSession[] {
  const existingIndex = sessions.findIndex((item) => item.dayOfWeek === dayOfWeek)

  if (existingIndex === -1) {
    return [...sessions, session].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  }

  const next = [...sessions]
  next[existingIndex] = session
  return next.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
}

function createRestDaySession(weekNumber: number, dayOfWeek: number, date: Date): TrainingSession {
  return {
    id: `rest_${weekNumber}_${dayOfWeek}_${Date.now()}`,
    date,
    dayOfWeek,
    type: 'recovery',
    duration: 0,
    intensity: 'easy',
    description: 'Rest Day',
    focus: ['Recovery and adaptation'],
    equipment: [],
    notes: 'Full rest day. Optional: mobility and stretching.',
    structuredWorkout: ['Rest day', 'Optional mobility and stretching'],
  }
}

function buildEditableProfile(plan: TrainingPlan, profile?: Partial<UserProfile> | null): Partial<UserProfile> {
  return {
    planName: profile?.planName || plan.name,
    age: profile?.age || 35,
    height: profile?.height || 180,
    weight: profile?.weight || 75,
    goal: profile?.goal || plan.goal,
    planStartDate: profile?.planStartDate || formatDateInput(plan.startDate),
    desiredPlanWeeks: profile?.desiredPlanWeeks || plan.durationWeeks,
    ftpIncreaseTargetWatts: profile?.ftpIncreaseTargetWatts ?? plan.targetMetrics.ftpIncreaseTargetWatts,
    plannedEvents: profile?.plannedEvents || [],
    injuries: profile?.injuries || [],
    equipment: profile?.equipment || [],
    hasPowerMeter: profile?.hasPowerMeter || false,
    intensityDistribution: profile?.intensityDistribution || 'conservative',
    qualityPriority: profile?.qualityPriority || 'balanced',
    hardSessionsPerWeekCap: profile?.hardSessionsPerWeekCap || 2,
    shortDayPreference: profile?.shortDayPreference || 'mixed',
    dietPreference: profile?.dietPreference || 'mediterranean',
    dailyCalorieTarget: profile?.dailyCalorieTarget,
    dailyProteinTargetGrams: profile?.dailyProteinTargetGrams,
    dailyCarbTargetGrams: profile?.dailyCarbTargetGrams,
    dailyFatTargetGrams: profile?.dailyFatTargetGrams,
    availableTime: profile?.availableTime || {
      monday: 1,
      tuesday: 1.5,
      wednesday: 1,
      thursday: 1.5,
      friday: 1,
      saturday: 2.5,
      sunday: 1.5,
    },
    ftp: profile?.ftp,
    maxHeartRate: profile?.maxHeartRate,
  }
}

function buildAthleteProfileTemplate(profile?: Partial<UserProfile> | null): UserProfile {
  const today = new Date()

  return {
    id: profile?.id || `profile_${Date.now()}`,
    planName: profile?.planName || 'My Training Plan',
    age: profile?.age || 35,
    height: profile?.height || 180,
    weight: profile?.weight || 75,
    goal: (profile?.goal || 'ftp_increase') as TrainingGoal,
    planStartDate: profile?.planStartDate || formatDateInput(today),
    desiredPlanWeeks: profile?.desiredPlanWeeks || 12,
    ftpIncreaseTargetWatts: profile?.ftpIncreaseTargetWatts ?? 0,
    plannedEvents: profile?.plannedEvents || [],
    injuries: profile?.injuries || [],
    equipment: profile?.equipment || [],
    hasPowerMeter: profile?.hasPowerMeter || false,
    intensityDistribution: profile?.intensityDistribution || 'conservative',
    qualityPriority: profile?.qualityPriority || 'balanced',
    hardSessionsPerWeekCap: profile?.hardSessionsPerWeekCap || 2,
    shortDayPreference: profile?.shortDayPreference || 'mixed',
    dietPreference: profile?.dietPreference || 'mediterranean',
    dailyCalorieTarget: profile?.dailyCalorieTarget,
    dailyProteinTargetGrams: profile?.dailyProteinTargetGrams,
    dailyCarbTargetGrams: profile?.dailyCarbTargetGrams,
    dailyFatTargetGrams: profile?.dailyFatTargetGrams,
    availableTime: {
      monday: 1,
      tuesday: 1.5,
      wednesday: 1,
      thursday: 1.5,
      friday: 1,
      saturday: 2.5,
      sunday: 1.5,
      ...profile?.availableTime,
    },
    ftp: profile?.ftp,
    maxHeartRate: profile?.maxHeartRate,
    createdAt: new Date((profile?.createdAt as unknown as string | number | Date) || Date.now()),
    updatedAt: new Date((profile?.updatedAt as unknown as string | number | Date) || Date.now()),
  }
}

function buildPlanCreationDraft(profile?: Partial<UserProfile> | null): Partial<UserProfile> {
  const template = buildAthleteProfileTemplate(profile)

  return {
    planName: template.planName,
    goal: template.goal,
    intensityDistribution: template.intensityDistribution,
    qualityPriority: template.qualityPriority,
    hardSessionsPerWeekCap: template.hardSessionsPerWeekCap,
    shortDayPreference: template.shortDayPreference,
    dietPreference: template.dietPreference,
    dailyCalorieTarget: template.dailyCalorieTarget,
    dailyProteinTargetGrams: template.dailyProteinTargetGrams,
    dailyCarbTargetGrams: template.dailyCarbTargetGrams,
    dailyFatTargetGrams: template.dailyFatTargetGrams,
    planStartDate: template.planStartDate,
    desiredPlanWeeks: template.desiredPlanWeeks,
    ftpIncreaseTargetWatts: template.ftpIncreaseTargetWatts,
    plannedEvents: template.plannedEvents || [],
  }
}

function deriveSignatureBiasReasons(signature?: AthleteRideSignature): string[] {
  if (!signature) {
    return ['No signature data available yet.']
  }

  const reasons: string[] = []

  if (signature.sustainedPowerFraction < 0.9 || signature.powerDurationProfile.thresholdPowerFraction < 0.94) {
    reasons.push('Adds more threshold-oriented sessions to raise sustainable power.')
  }

  if (signature.powerDurationProfile.vo2PowerFraction < 1.03 || signature.highIntensityDensityScore < 0.95) {
    reasons.push('Increases VO2 interval frequency (30/15 or 40/20) to improve high-intensity repeatability.')
  }

  if (
    signature.enduranceDecouplingScore < 0.94 ||
    signature.powerDurationProfile.longEndurancePowerFraction < 0.66 ||
    signature.fatigueResistanceScore < 0.82
  ) {
    reasons.push('Shifts weekly mix toward longer endurance support and aerobic durability.')
  }

  if (signature.climbingProfile.sustainedUphillPowerFraction < 0.93 || signature.climbingProfile.climbingTrendScore < 0.98) {
    reasons.push('Biases climbing blocks toward sustained threshold work for uphill power progression.')
  }

  if (reasons.length === 0) {
    reasons.push('Keeps a balanced mix because no clear weakness was detected in recent rides.')
  }

  return reasons
}

function countTrainableSessions(plan: TrainingPlan): number {
  return plan.weeks.flatMap((week) => week.sessions).filter((session) => session.duration > 0).length
}

function countTrainableSessionsAfterWeekOne(plan: TrainingPlan): number {
  return plan.weeks
    .filter((week) => week.weekNumber > 1)
    .flatMap((week) => week.sessions)
    .filter((session) => session.duration > 0).length
}

function hasCollapsedFutureWeeks(plan: TrainingPlan): boolean {
  return plan.durationWeeks > 1 && countTrainableSessionsAfterWeekOne(plan) === 0
}

function recoverCorruptedStoredPlan(storedPlan: StoredPlan): TrainingPlan {
  const currentPlan = storedPlan.plan
  const originalPlan = storedPlan.originalPlan

  if (!currentPlan || !originalPlan || currentPlan.durationWeeks <= 1) {
    return currentPlan
  }

  const currentFutureTrainable = countTrainableSessionsAfterWeekOne(currentPlan)
  const originalFutureTrainable = countTrainableSessionsAfterWeekOne(originalPlan)
  const currentTotalTrainable = countTrainableSessions(currentPlan)
  const originalTotalTrainable = countTrainableSessions(originalPlan)

  const looksCollapsedToWeekOne = currentFutureTrainable === 0 && originalFutureTrainable > 0
  const originalHasMeaningfullyMoreData = originalTotalTrainable >= currentTotalTrainable + 3

  if (!looksCollapsedToWeekOne || !originalHasMeaningfullyMoreData) {
    return currentPlan
  }

  return {
    ...originalPlan,
    externalPlanId: currentPlan.externalPlanId || originalPlan.externalPlanId || originalPlan.id,
    intervalsSync: currentPlan.intervalsSync,
    updatedAt: currentPlan.updatedAt,
  }
}

function mergeCollapsedPlanWithRegeneratedWeeks(basePlan: TrainingPlan, regeneratedPlan: TrainingPlan): TrainingPlan {
  const mergedWeeks = regeneratedPlan.weeks.map((regeneratedWeek) => {
    const baseWeek = basePlan.weeks.find((week) => week.weekNumber === regeneratedWeek.weekNumber)
    if (!baseWeek) {
      return regeneratedWeek
    }

    const baseWeekHasTrainable = baseWeek.sessions.some((session) => session.duration > 0)
    if (baseWeek.weekNumber === 1 || baseWeekHasTrainable) {
      return baseWeek
    }

    return regeneratedWeek
  })

  return {
    ...regeneratedPlan,
    id: basePlan.id,
    externalPlanId: basePlan.externalPlanId || regeneratedPlan.externalPlanId || basePlan.id,
    createdAt: basePlan.createdAt,
    updatedAt: basePlan.updatedAt,
    intervalsSync: basePlan.intervalsSync,
    weeks: mergedWeeks,
    mealSuggestions: basePlan.mealSuggestions?.length ? basePlan.mealSuggestions : regeneratedPlan.mealSuggestions,
  }
}

function formatDateInput(date: Date | string): string {
  const normalized = date instanceof Date ? date : new Date(date)
  const year = normalized.getFullYear()
  const month = String(normalized.getMonth() + 1).padStart(2, '0')
  const day = String(normalized.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDefaultPlanNameFromProfile(profile: Partial<UserProfile>): string {
  const goal = (profile.goal || 'ftp_increase') as TrainingGoal
  const startDate = profile.planStartDate ? new Date(profile.planStartDate) : new Date()
  const label = goal.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  return `${label} Block ${formatDateInput(startDate)}`
}

function buildDuplicatePlanName(sourceName: string, existingNames: string[]): string {
  const baseName = sourceName.includes('(Copy') ? sourceName.replace(/\s*\(Copy(?:\s+\d+)?\)$/, '') : sourceName
  const existing = new Set(existingNames)
  const firstCandidate = `${baseName} (Copy)`

  if (!existing.has(firstCandidate)) {
    return firstCandidate
  }

  let copyIndex = 2
  while (existing.has(`${baseName} (Copy ${copyIndex})`)) {
    copyIndex += 1
  }

  return `${baseName} (Copy ${copyIndex})`
}

function buildSyncErrorMessage(error?: string, details?: string): string {
  if (error && details) {
    return `${error} ${details}`
  }

  return error || details || 'Failed to sync plan with Intervals.icu'
}

type RemotePlanEventSnapshot = {
  date: string
  externalId: string
  sessionId: string | null
  name?: string
  description?: string
  movingTimeSeconds?: number
  workoutType?: string
  lastUpdatedAt?: string
}

function toTimestampMs(value: string | number | Date | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isNaN(parsed)) {
    return parsed
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }

  return undefined
}

function toRestDayFromRemoval(session: TrainingSession): TrainingSession {
  return {
    ...session,
    type: 'recovery',
    duration: 0,
    intensity: 'easy',
    description: 'Rest Day',
    focus: ['Recovery and adaptation'],
    notes: 'Session was removed from Intervals.icu and auto-cleared.',
    structuredWorkout: ['Rest day'],
    localUpdatedAt: undefined,
  }
}

function applyRemoteEventToSession(session: TrainingSession, remoteEvent: RemotePlanEventSnapshot): TrainingSession {
  const nextType = inferSessionTypeFromRemoteEvent(session.type, remoteEvent)
  const nextDuration =
    typeof remoteEvent.movingTimeSeconds === 'number' && remoteEvent.movingTimeSeconds > 0
      ? Math.max(1, Math.round(remoteEvent.movingTimeSeconds / 60))
      : session.duration

  const nextDescription = remoteEvent.description || remoteEvent.name || session.description
  const remoteStructuredSteps = remoteEvent.description
    ? remoteEvent.description
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : session.structuredWorkout

  return {
    ...session,
    type: nextType,
    intensity: mapIntensityBySessionType(nextType),
    duration: nextDuration,
    description: nextDescription,
    structuredWorkout: remoteStructuredSteps,
    localUpdatedAt: remoteEvent.lastUpdatedAt,
  }
}

function inferSessionTypeFromRemoteEvent(
  fallbackType: TrainingSession['type'],
  remoteEvent: Pick<RemotePlanEventSnapshot, 'name' | 'workoutType'>
): TrainingSession['type'] {
  const workoutType = (remoteEvent.workoutType || '').toLowerCase()
  if (workoutType.includes('weight')) {
    return 'strength'
  }

  const name = (remoteEvent.name || '').toLowerCase()
  if (name.includes('vo2')) return 'vo2max'
  if (name.includes('threshold')) return 'threshold'
  if (name.includes('anaerobic')) return 'anaerobic'
  if (name.includes('tempo')) return 'tempo'
  if (name.includes('recovery') || name.includes('rest')) return 'recovery'
  if (name.includes('strength')) return 'strength'
  if (name.includes('endurance')) return 'endurance'

  return fallbackType
}

function mapIntensityBySessionType(sessionType: TrainingSession['type']): TrainingSession['intensity'] {
  if (sessionType === 'recovery') {
    return 'easy'
  }

  if (sessionType === 'endurance') {
    return 'moderate'
  }

  if (sessionType === 'tempo' || sessionType === 'strength') {
    return 'hard'
  }

  return 'very_hard'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
