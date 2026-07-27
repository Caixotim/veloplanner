'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { UserProfileForm } from '../components/UserProfileForm'
import { storage, type StoredPlan } from '../lib/storage'
import { fetchIntervalsBlockedDates, getIntervalsTrainingInsights } from '../lib/intervalsIntegration'
import { buildAthletePlanContext, buildPlanRequest, calculateTargetMetrics, generateTrainingPlan } from '../lib/trainingPlanner'
import { generateMealSuggestionsWithApi } from '../lib/mealPlanner'
import { buildIntervalsCredentialHeaders } from '../lib/integrationCredentials'
import type { TrainingGoal, TrainingPlan, UserProfile } from '../lib/types'
import styles from './page.module.scss'

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

type PlanSyncMode = 'upsert' | 'delete'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [linkedPlan, setLinkedPlan] = useState<StoredPlan | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  const planId = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }

    return new URLSearchParams(window.location.search).get('planId')
  }, [])

  const loadContext = useCallback(async () => {
    setLoading(true)

    try {
      if (planId) {
        const storedPlan = await storage.loadPlan(planId)

        if (storedPlan) {
          setLinkedPlan(storedPlan)
          const scopedProfile = await storage.loadProfile(storedPlan.plan.userId)
          setProfile(buildAthleteProfileTemplate(scopedProfile, storedPlan.plan))
          setLoading(false)
          return
        }
      }

      const profiles = await storage.loadProfiles()
      const latestProfile = [...profiles].sort((left, right) => {
        const leftTime = Number(new Date((left.updatedAt as unknown as Date) || left.createdAt || 0))
        const rightTime = Number(new Date((right.updatedAt as unknown as Date) || right.createdAt || 0))
        return rightTime - leftTime
      })[0]

      if (latestProfile) {
        setProfile(buildAthleteProfileTemplate(latestProfile))
      } else {
        setProfile(buildAthleteProfileTemplate())
      }
    } catch (error) {
      console.error('Failed to load profile context', error)
      setStatus({ kind: 'error', message: toErrorMessage(error) })
      setProfile(buildAthleteProfileTemplate())
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadContext()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [loadContext])

  const syncPlanWithIntervals = useCallback(async (mode: PlanSyncMode, planToSync: TrainingPlan) => {
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
      error?: string
      details?: string
    }>
  }, [])

  const handleSaveAthleteProfile = useCallback(async (profileUpdates: Partial<UserProfile>) => {
    const currentProfile = buildAthleteProfileTemplate(profile, linkedPlan?.plan)

    try {
      setSaving(true)
      setStatus({ kind: 'idle' })

      const nextProfile: UserProfile = {
        ...currentProfile,
        ...profileUpdates,
        id: currentProfile.id || `profile_${Date.now()}`,
        planName: currentProfile.planName || linkedPlan?.plan.name || 'My Training Plan',
        goal: (currentProfile.goal || linkedPlan?.plan.goal || 'ftp_increase') as TrainingGoal,
        planStartDate: currentProfile.planStartDate || formatDateInput(linkedPlan?.plan.startDate || new Date()),
        desiredPlanWeeks: currentProfile.desiredPlanWeeks || linkedPlan?.plan.durationWeeks || 12,
        ftpIncreaseTargetWatts: currentProfile.ftpIncreaseTargetWatts ?? linkedPlan?.plan.targetMetrics.ftpIncreaseTargetWatts,
        createdAt: new Date((currentProfile.createdAt as unknown as string | number | Date) || Date.now()),
        updatedAt: new Date(),
      }

      await storage.saveProfile(nextProfile)
      setProfile(nextProfile)

      if (!linkedPlan) {
        setStatus({ kind: 'success', message: 'Athlete profile saved. New plans will use this profile by default.' })
        return
      }

      const impact = assessProfileUpdateImpact(currentProfile, nextProfile, linkedPlan.plan)

      if (impact.requiresPlanRegeneration) {
        const planRequest = buildPlanRequest(nextProfile)
        const intervalsInsights = await getIntervalsTrainingInsights(nextProfile.weight)
        const blockedDates = await fetchIntervalsBlockedDates(
          formatDateInput(planRequest.startDate),
          formatDateInput(new Date(planRequest.startDate.getTime() + planRequest.durationWeeks * 7 * 24 * 60 * 60 * 1000))
        )
        const regeneratedPlan = generateTrainingPlan(
          linkedPlan.plan.userId,
          planRequest,
          buildAthletePlanContext(nextProfile),
          { intervalsInsights, blockedDates }
        )

        regeneratedPlan.mealSuggestions = await generateMealSuggestionsWithApi(regeneratedPlan.durationWeeks, {
          profile: nextProfile,
        })

        let nextPlan: TrainingPlan = {
          ...regeneratedPlan,
          id: linkedPlan.plan.id,
          externalPlanId: linkedPlan.plan.externalPlanId || linkedPlan.plan.id,
          userId: linkedPlan.plan.userId,
          name: linkedPlan.plan.name,
          createdAt: linkedPlan.plan.createdAt,
          updatedAt: new Date(),
          intervalsSync: linkedPlan.plan.intervalsSync,
        }

        try {
          await syncPlanWithIntervals('delete', linkedPlan.plan)
          const syncResult = await syncPlanWithIntervals('upsert', nextPlan)

          if (syncResult.success) {
            nextPlan = {
              ...nextPlan,
              externalPlanId: syncResult.externalPlanId || nextPlan.externalPlanId || nextPlan.id,
              intervalsSync: {
                syncedAt: new Date().toISOString(),
              },
            }
          } else if (syncResult.error) {
            setStatus({ kind: 'error', message: buildSyncErrorMessage(syncResult.error, syncResult.details) })
          }
        } catch (error) {
          setStatus({ kind: 'error', message: toErrorMessage(error) })
          console.error('Failed to resync regenerated plan after athlete profile update', toErrorMessage(error))
        }

        await storage.updatePlan(linkedPlan.plan.id, nextPlan)
        setLinkedPlan((current) => (current ? { ...current, plan: nextPlan, updatedAt: Date.now(), isModified: true } : current))
        setStatus({ kind: 'success', message: `Athlete profile updated. Plan regenerated because ${impact.reasons.join(', ')}.` })
        return
      }

      if (impact.requiresMetricRefresh) {
        const refreshedPlan = {
          ...linkedPlan.plan,
          targetMetrics: calculateTargetMetrics(nextProfile, nextProfile.desiredPlanWeeks || linkedPlan.plan.durationWeeks),
          updatedAt: new Date(),
        }

        await storage.updatePlan(linkedPlan.plan.id, refreshedPlan)
        setLinkedPlan((current) => (current ? { ...current, plan: refreshedPlan, updatedAt: Date.now(), isModified: true } : current))
        setStatus({ kind: 'success', message: 'Athlete profile updated. Refreshed climbing metrics after weight change.' })
        return
      }

      setStatus({ kind: 'success', message: 'Athlete profile updated. Current plan still applies.' })
    } catch (error) {
      console.error('Failed to save athlete profile', error)
      setStatus({ kind: 'error', message: toErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }, [linkedPlan, profile, syncPlanWithIntervals])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Athlete Profile</h1>
          <p>Manage rider data separately from plan inputs.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/" className={styles.backLink}>
            Back to Plans
          </Link>
        </div>
      </header>

      {linkedPlan && (
        <section className={styles.section}>
          <h2>Linked Plan</h2>
          <p>
            Editing this profile can regenerate: <strong>{linkedPlan.plan.name}</strong>
          </p>
        </section>
      )}

      {!loading && profile && (
        <UserProfileForm
          key={`athlete-profile-${profile.id}-${new Date((profile.updatedAt as unknown as string | number | Date) || 0).getTime()}`}
          onSubmit={handleSaveAthleteProfile}
          loading={saving}
          initialProfile={profile}
          title="Athlete Details"
          submitLabel="Save Athlete Profile"
          showPlanInputs={false}
          showAthleteDetails={true}
        />
      )}

      {loading && (
        <section className={styles.section}>
          <p>Loading profile...</p>
        </section>
      )}

      {status.kind !== 'idle' && (
        <section className={status.kind === 'error' ? styles.error : styles.success}>
          <p>{status.message}</p>
        </section>
      )}
    </div>
  )
}

function buildAthleteProfileTemplate(profile?: Partial<UserProfile> | null, linkedPlan?: TrainingPlan): UserProfile {
  const today = new Date()

  return {
    id: profile?.id || linkedPlan?.userId || `profile_${Date.now()}`,
    planName: profile?.planName || linkedPlan?.name || 'My Training Plan',
    age: profile?.age || 35,
    height: profile?.height || 180,
    weight: profile?.weight || 75,
    goal: profile?.goal || linkedPlan?.goal || 'ftp_increase',
    planStartDate: profile?.planStartDate || formatDateInput(linkedPlan?.startDate || today),
    desiredPlanWeeks: profile?.desiredPlanWeeks || linkedPlan?.durationWeeks || 12,
    ftpIncreaseTargetWatts: profile?.ftpIncreaseTargetWatts ?? linkedPlan?.targetMetrics.ftpIncreaseTargetWatts ?? 0,
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
      monday: profile?.availableTime?.monday ?? 1,
      tuesday: profile?.availableTime?.tuesday ?? 1.5,
      wednesday: profile?.availableTime?.wednesday ?? 1,
      thursday: profile?.availableTime?.thursday ?? 1.5,
      friday: profile?.availableTime?.friday ?? 1,
      saturday: profile?.availableTime?.saturday ?? 2.5,
      sunday: profile?.availableTime?.sunday ?? 1.5,
    },
    ftp: profile?.ftp,
    maxHeartRate: profile?.maxHeartRate,
    createdAt: new Date((profile?.createdAt as unknown as string | number | Date) || Date.now()),
    updatedAt: new Date((profile?.updatedAt as unknown as string | number | Date) || Date.now()),
  }
}

function assessProfileUpdateImpact(previousProfile: UserProfile, nextProfile: UserProfile, currentPlan: TrainingPlan) {
  const reasons: string[] = []

  if ((previousProfile.planName || currentPlan.name) !== (nextProfile.planName || currentPlan.name)) {
    reasons.push('the plan name changed')
  }

  if (previousProfile.goal !== nextProfile.goal) {
    reasons.push('the goal changed')
  }

  if ((previousProfile.desiredPlanWeeks || currentPlan.durationWeeks) !== (nextProfile.desiredPlanWeeks || currentPlan.durationWeeks)) {
    reasons.push('the timeframe changed')
  }

  if ((previousProfile.planStartDate || formatDateInput(currentPlan.startDate)) !== (nextProfile.planStartDate || formatDateInput(currentPlan.startDate))) {
    reasons.push('the plan start date changed')
  }

  if ((previousProfile.ftpIncreaseTargetWatts || 0) !== (nextProfile.ftpIncreaseTargetWatts || 0)) {
    reasons.push('the target FTP gain changed')
  }

  if (!samePlannedEvents(previousProfile.plannedEvents, nextProfile.plannedEvents)) {
    reasons.push('priority events changed')
  }

  if (!sameNumberMap(previousProfile.availableTime, nextProfile.availableTime)) {
    reasons.push('weekly availability changed')
  }

  if (!sameStringArray(previousProfile.equipment, nextProfile.equipment)) {
    reasons.push('available equipment changed')
  }

  if (previousProfile.hasPowerMeter !== nextProfile.hasPowerMeter) {
    reasons.push('power-based workout targeting changed')
  }

  if ((previousProfile.intensityDistribution || 'conservative') !== (nextProfile.intensityDistribution || 'conservative')) {
    reasons.push('intensity distribution changed')
  }

  if ((previousProfile.qualityPriority || 'balanced') !== (nextProfile.qualityPriority || 'balanced')) {
    reasons.push('quality priority changed')
  }

  if ((previousProfile.hardSessionsPerWeekCap || 2) !== (nextProfile.hardSessionsPerWeekCap || 2)) {
    reasons.push('hard sessions cap changed')
  }

  if ((previousProfile.shortDayPreference || 'mixed') !== (nextProfile.shortDayPreference || 'mixed')) {
    reasons.push('short-day preference changed')
  }

  if ((previousProfile.dietPreference || 'mediterranean') !== (nextProfile.dietPreference || 'mediterranean')) {
    reasons.push('diet preference changed')
  }

  if ((previousProfile.dailyCalorieTarget || 0) !== (nextProfile.dailyCalorieTarget || 0)) {
    reasons.push('daily calorie target changed')
  }

  if ((previousProfile.dailyProteinTargetGrams || 0) !== (nextProfile.dailyProteinTargetGrams || 0)) {
    reasons.push('daily protein target changed')
  }

  if ((previousProfile.dailyCarbTargetGrams || 0) !== (nextProfile.dailyCarbTargetGrams || 0)) {
    reasons.push('daily carbohydrate target changed')
  }

  if ((previousProfile.dailyFatTargetGrams || 0) !== (nextProfile.dailyFatTargetGrams || 0)) {
    reasons.push('daily fat target changed')
  }

  if ((previousProfile.ftp || 0) !== (nextProfile.ftp || 0)) {
    reasons.push('FTP changed')
  }

  if (!nextProfile.hasPowerMeter && (previousProfile.maxHeartRate || 0) !== (nextProfile.maxHeartRate || 0)) {
    reasons.push('heart-rate targeting changed')
  }

  const weightChanged = (previousProfile.weight || 0) !== (nextProfile.weight || 0)
  const requiresMetricRefresh = weightChanged && Boolean(currentPlan.targetMetrics.climbingWattsPerKg)

  return {
    requiresPlanRegeneration: reasons.length > 0,
    requiresMetricRefresh,
    reasons,
  }
}

function sameStringArray(left: string[] = [], right: string[] = []): boolean {
  if (left.length !== right.length) {
    return false
  }

  const leftSorted = [...left].sort()
  const rightSorted = [...right].sort()
  return leftSorted.every((value, index) => value === rightSorted[index])
}

function sameNumberMap(left: UserProfile['availableTime'], right: UserProfile['availableTime']): boolean {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  return days.every((day) => (left?.[day] || 0) === (right?.[day] || 0))
}

function samePlannedEvents(left: UserProfile['plannedEvents'] = [], right: UserProfile['plannedEvents'] = []): boolean {
  const normalized = (events: UserProfile['plannedEvents']) =>
    (events || [])
      .filter((event) => event.name || event.date)
      .map((event) => `${event.priority}|${event.date}|${event.name}`)
      .sort()

  const leftNormalized = normalized(left)
  const rightNormalized = normalized(right)

  if (leftNormalized.length !== rightNormalized.length) {
    return false
  }

  return leftNormalized.every((value, index) => value === rightNormalized[index])
}

function formatDateInput(date: Date | string): string {
  const target = new Date(date)

  const year = target.getFullYear()
  const month = String(target.getMonth() + 1).padStart(2, '0')
  const day = String(target.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function buildSyncErrorMessage(error?: string, details?: string): string {
  const fallback = error || 'Failed to sync with Intervals.icu'

  if (!details || details === error) {
    return fallback
  }

  return `${fallback}: ${details}`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}
