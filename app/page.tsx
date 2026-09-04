'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { storage } from './lib/storage'
import type { DailyReadinessEntry, UserProfile } from './lib/types'
import { ReadinessCheckIn, summarizeReadiness } from './components/ReadinessCheckIn'
import { GripIcon } from './components/icons/AppIcons'
import styles from './dashboard.module.scss'

type DashboardStats = {
  totalRidesSynced: number
  ridesLast12Weeks: number
  rideHoursLast12Weeks: number
  avgRideDistanceKm: number
  activeAthleteProfiles: number
  profileSnapshots: number
  lastSyncTime: number
  syncStatus: 'success' | 'error' | 'pending'
}

type UserSnapshot = {
  planName: string
  goal: string
  age: number | null
  weight: number | null
  ftp: number | null
  maxHeartRate: number | null
  hasPowerMeter: boolean
}

type RideCacheEntry = {
  rideDate?: number
  duration?: number
  distance?: number
  intensity?: number
  normalizedPower?: number
  ftpWatts?: number
}

type DashboardWidgetKey = 'ridesByWeek' | 'rideHoursByWeek' | 'rideIntensityMix'

type WeeklyRideSeriesPoint = {
  week: string
  rides: number
  hours: number
  distance: number
}

type RideIntensityMixPoint = {
  bucket: string
  count: number
  color: string
}

type DailySnapshotSession = {
  planId: string
  planName: string
  sessionId: string
  type: string
  duration: number
  intensity: 'easy' | 'moderate' | 'hard' | 'very_hard'
  description: string
  preDayNutritionTip?: string
}

const DEFAULT_STATS: DashboardStats = {
  totalRidesSynced: 0,
  ridesLast12Weeks: 0,
  rideHoursLast12Weeks: 0,
  avgRideDistanceKm: 0,
  activeAthleteProfiles: 0,
  profileSnapshots: 0,
  lastSyncTime: 0,
  syncStatus: 'pending',
}

const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  ridesByWeek: 'Rides by Week',
  rideHoursByWeek: 'Ride Hours by Week',
  rideIntensityMix: 'Ride Intensity Mix',
}

const DEFAULT_WIDGETS: DashboardWidgetKey[] = ['ridesByWeek', 'rideHoursByWeek', 'rideIntensityMix']

const WIDGET_STORAGE_KEY = 'dashboard_widgets_v1'
const READINESS_NOTE_PREVIEW_LIMIT = 72

const RIDE_INTENSITY_COLORS = {
  low: '#2f8f57',
  moderate: '#c47f22',
  high: '#aa3c3c',
} as const

export default function Home() {
  useEffect(() => {
    window.location.replace('/coach')
  }, [])

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS)
  const [userSnapshot, setUserSnapshot] = useState<UserSnapshot | null>(null)
  const [dailySessions, setDailySessions] = useState<DailySnapshotSession[]>([])
  const [dailyNutritionTips, setDailyNutritionTips] = useState<string[]>([])
  const [dailyReadiness, setDailyReadiness] = useState<DailyReadinessEntry | undefined>(undefined)
  const [recentRides, setRecentRides] = useState<RideCacheEntry[]>([])
  const [enabledWidgets, setEnabledWidgets] = useState<DashboardWidgetKey[]>(DEFAULT_WIDGETS)
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetKey | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const raw = window.localStorage.getItem(WIDGET_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as DashboardWidgetKey[]
      const valid = parsed.filter((key): key is DashboardWidgetKey => key in WIDGET_LABELS)
      if (valid.length > 0) {
        const frameId = window.requestAnimationFrame(() => setEnabledWidgets(valid))
        return () => window.cancelAnimationFrame(frameId)
      }
    } catch {
      // Keep defaults when persisted state is invalid.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(enabledWidgets))
  }, [enabledWidgets])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(async () => {
      try {
        await storage.init()
        const now = Date.now()
        const twelveWeeksAgo = now - 84 * 24 * 60 * 60 * 1000
        const [plans, profiles, syncMeta, profileSnapshotCount, cachedRides] = await Promise.all([
          storage.loadAllPlans(),
          storage.loadProfiles(),
          storage.getSyncMetadata(),
          storage.getProfileSnapshotCount(),
          storage.getCachedRides(twelveWeeksAgo),
        ])

        const todayKey = formatLocalDateKey(new Date())
        const readinessEntry = await storage.getDailyReadiness(todayKey)
        setDailyReadiness(readinessEntry)
        const todaySessions = plans
          .flatMap((storedPlan) => {
            const plan = storedPlan.plan
            if (!plan) {
              return [] as DailySnapshotSession[]
            }

            return plan.weeks.flatMap((week) =>
              week.sessions
                .filter((session) => formatLocalDateKey(toDate(session.date)) === todayKey)
                .map((session) => ({
                  planId: plan.id,
                  planName: plan.name,
                  sessionId: session.id,
                  type: session.type,
                  duration: session.duration,
                  intensity: session.intensity,
                  description: session.description,
                  preDayNutritionTip: session.preDayNutritionTip,
                }))
            )
          })
          .sort((left, right) => {
            const priorityDiff = getSessionPriorityScore(right.type) - getSessionPriorityScore(left.type)
            if (priorityDiff !== 0) {
              return priorityDiff
            }

            const intensityDiff = getIntensityRank(right.intensity) - getIntensityRank(left.intensity)
            if (intensityDiff !== 0) {
              return intensityDiff
            }

            const durationDiff = right.duration - left.duration
            if (durationDiff !== 0) {
              return durationDiff
            }

            return left.planName.localeCompare(right.planName)
          })

        setDailySessions(todaySessions)

        const nutritionTips = new Set<string>()
        for (const session of todaySessions) {
          if (session.preDayNutritionTip) {
            nutritionTips.add(session.preDayNutritionTip)
            continue
          }

          nutritionTips.add(getDefaultNutritionTipForSession(session.type, session.intensity, session.duration))
        }

        setDailyNutritionTips(Array.from(nutritionTips).slice(0, 6))

        const latestPlanEntry = [...plans].sort((left, right) => right.updatedAt - left.updatedAt)[0]
        const activePlan = latestPlanEntry?.plan || null
        setRecentRides(cachedRides as RideCacheEntry[])

        const latestProfile = [...profiles].sort((left, right) => {
          const leftUpdated = Number(new Date((left.updatedAt as unknown as Date) || left.createdAt || 0))
          const rightUpdated = Number(new Date((right.updatedAt as unknown as Date) || right.createdAt || 0))
          return rightUpdated - leftUpdated
        })[0] as UserProfile | undefined

        if (activePlan || latestProfile) {
          setUserSnapshot({
            planName: activePlan?.name || latestProfile?.planName || 'No active plan',
            goal: (latestProfile?.goal || activePlan?.goal || 'N/A').replace(/_/g, ' '),
            age: latestProfile?.age ?? null,
            weight: latestProfile?.weight ?? null,
            ftp: latestProfile?.ftp ?? activePlan?.targetMetrics.ftpTarget ?? null,
            maxHeartRate: latestProfile?.maxHeartRate ?? null,
            hasPowerMeter: Boolean(latestProfile?.hasPowerMeter),
          })
        } else {
          setUserSnapshot(null)
        }

        const rides = cachedRides as RideCacheEntry[]
        const rideHoursLast12Weeks = rides.reduce((sum, ride) => sum + normalizeRideHours(ride.duration), 0)
        const ridesWithDistance = rides.filter(
          (ride) => typeof ride.distance === 'number' && Number.isFinite(ride.distance) && ride.distance > 0
        )
        const avgRideDistanceKm =
          ridesWithDistance.length > 0
            ? ridesWithDistance.reduce((sum, ride) => sum + (ride.distance || 0), 0) / ridesWithDistance.length
            : 0

        setStats({
          totalRidesSynced: Math.max(syncMeta.totalRidesSynced || 0, rides.length),
          ridesLast12Weeks: rides.length,
          rideHoursLast12Weeks: Number(rideHoursLast12Weeks.toFixed(1)),
          avgRideDistanceKm: Number(avgRideDistanceKm.toFixed(1)),
          activeAthleteProfiles: profiles.length > 0 ? 1 : 0,
          profileSnapshots: profileSnapshotCount,
          lastSyncTime: syncMeta.lastSyncTime,
          syncStatus: syncMeta.lastSyncStatus,
        })

      } catch (error) {
        console.error('Failed to load dashboard metrics', error)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  const weeklyRideSeries = useMemo<WeeklyRideSeriesPoint[]>(() => {
    if (recentRides.length === 0) {
      return []
    }

    const buckets = new Map<string, { start: number; rides: number; hours: number; distance: number }>()
    for (const ride of recentRides) {
      if (typeof ride.rideDate !== 'number' || !Number.isFinite(ride.rideDate)) {
        continue
      }

      const startOfWeek = getWeekStartTimestamp(ride.rideDate)
      const key = new Date(startOfWeek).toISOString().slice(0, 10)
      const current = buckets.get(key) || { start: startOfWeek, rides: 0, hours: 0, distance: 0 }

      current.rides += 1
      current.hours += normalizeRideHours(ride.duration)
      current.distance += typeof ride.distance === 'number' && Number.isFinite(ride.distance) ? ride.distance : 0
      buckets.set(key, current)
    }

    return Array.from(buckets.values())
      .sort((left, right) => left.start - right.start)
      .slice(-10)
      .map((entry) => ({
        week: formatWeekLabel(entry.start),
        rides: entry.rides,
        hours: Number(entry.hours.toFixed(1)),
        distance: Number(entry.distance.toFixed(1)),
      }))
  }, [recentRides])

  const rideIntensityMixSeries = useMemo<RideIntensityMixPoint[]>(() => {
    if (recentRides.length === 0) {
      return []
    }

    const buckets = {
      low: 0,
      moderate: 0,
      high: 0,
    }

    for (const ride of recentRides) {
      const intensityFactor = resolveRideIntensityFactor(ride)
      if (intensityFactor <= 0) {
        continue
      }

      if (intensityFactor < 0.75) {
        buckets.low += 1
      } else if (intensityFactor < 0.9) {
        buckets.moderate += 1
      } else {
        buckets.high += 1
      }
    }

    return [
      { bucket: 'Low', count: buckets.low, color: RIDE_INTENSITY_COLORS.low },
      { bucket: 'Moderate', count: buckets.moderate, color: RIDE_INTENSITY_COLORS.moderate },
      { bucket: 'High', count: buckets.high, color: RIDE_INTENSITY_COLORS.high },
    ].filter((entry) => entry.count > 0)
  }, [recentRides])

  const toggleWidget = (widgetKey: DashboardWidgetKey) => {
    setEnabledWidgets((current) => {
      if (current.includes(widgetKey)) {
        if (current.length === 1) {
          return current
        }
        return current.filter((entry) => entry !== widgetKey)
      }

      return [...current, widgetKey]
    })
  }

  const moveWidget = (source: DashboardWidgetKey, target: DashboardWidgetKey) => {
    if (source === target) {
      return
    }

    setEnabledWidgets((current) => {
      const sourceIndex = current.indexOf(source)
      const targetIndex = current.indexOf(target)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const next = [...current]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, source)
      return next
    })
  }

  const syncLabel = useMemo(() => {
    if (!stats.lastSyncTime) {
      return 'Not synced yet'
    }

    return new Date(stats.lastSyncTime).toLocaleString()
  }, [stats.lastSyncTime])

  const dailySnapshotSummary = useMemo(() => {
    const sessionsCount = dailySessions.length
    const totalMinutes = dailySessions.reduce((sum, session) => sum + session.duration, 0)
    return {
      sessionsCount,
      totalMinutes,
    }
  }, [dailySessions])

  const dailyReadinessImpact = useMemo(() => {
    if (!dailyReadiness) {
      return {
        tone: 'neutral' as const,
        title: 'No readiness check-in yet',
        message: 'Complete Morning Readiness to get a same-day pacing recommendation for your planned sessions.',
      }
    }

    const readiness = summarizeReadiness(dailyReadiness)
    const stressMinutes = dailySessions.reduce((sum, session) => {
      const intensityWeight =
        session.intensity === 'very_hard' ? 1.35 : session.intensity === 'hard' ? 1.2 : session.intensity === 'moderate' ? 1 : 0.8
      return sum + (session.duration * intensityWeight)
    }, 0)

    const heavyDay = stressMinutes >= 90

    if (readiness.tone === 'low') {
      return {
        tone: 'caution' as const,
        title: 'Recovery-first recommendation',
        message: heavyDay
          ? 'Your readiness is low and today is loaded. Consider reducing intervals, capping effort at endurance pace, or swapping with a recovery ride.'
          : 'Your readiness is low. Keep today easy, shorten volume if needed, and prioritize sleep and fueling before hard work resumes.',
      }
    }

    if (readiness.tone === 'ok') {
      return {
        tone: 'steady' as const,
        title: 'Steady-day recommendation',
        message: heavyDay
          ? 'Readiness is moderate with a demanding day planned. Start conservative and only progress to full targets if warm-up sensations are solid.'
          : 'Readiness is moderate. Stick to the plan with controlled pacing and keep intensity quality-focused.',
      }
    }

    return {
      tone: 'good' as const,
      title: 'Green light recommendation',
      message: heavyDay
        ? 'Readiness is strong for a demanding day. Proceed with planned quality work and recover well immediately after.'
        : 'Readiness is strong. This is a good day to execute the planned work as prescribed.',
    }
  }, [dailyReadiness, dailySessions])

  const dailyReadinessNote = useMemo(() => {
    const full = dailyReadiness?.notes?.trim()
    if (!full) {
      return null
    }

    const isTruncated = full.length > READINESS_NOTE_PREVIEW_LIMIT
    const preview = isTruncated
      ? `${full.slice(0, READINESS_NOTE_PREVIEW_LIMIT - 1)}...`
      : full

    return {
      preview,
      full: isTruncated ? full : undefined,
    }
  }, [dailyReadiness])

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>VeloPlanner overview</p>
        <h1>Train with clarity</h1>
        <p>Start with today&apos;s coaching recommendation, then use your progress metrics when you want to understand the bigger picture.</p>
        <div className={styles.heroActions}>
            <Link className={styles.syncBtn} href="/coach">
              Chat with your coach
          </Link>
          <Link href="/profile" className={styles.secondaryCta}>
            Open Profile
          </Link>
        </div>
      </section>

      <section className={styles.metricsSection}>
        <div className={styles.sectionIntro}>
          <div>
            <h2>Progress at a glance</h2>
            <p>Useful context without turning every training decision into a spreadsheet.</p>
          </div>
          <Link href="/coach" className={styles.textLink}>View coaching</Link>
        </div>
        <div className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <h2>{loading ? '...' : stats.totalRidesSynced}</h2>
            <p>Total Synced Rides</p>
          </article>
          <article className={styles.metricCard}>
            <h2>{loading ? '...' : stats.ridesLast12Weeks}</h2>
            <p>Rides (Last 12 Weeks)</p>
            <p className={styles.metricSubtle}>Profile snapshots: {loading ? '...' : stats.profileSnapshots}</p>
          </article>
          <article className={styles.metricCard}>
            <h2>{loading ? '...' : stats.rideHoursLast12Weeks.toFixed(1)}</h2>
            <p>Ride Hours (Last 12 Weeks)</p>
          </article>
          <article className={styles.metricCard}>
            <h2>{loading ? '...' : stats.avgRideDistanceKm.toFixed(1)} km</h2>
            <p>Avg Ride Distance</p>
            <p className={styles.metricSubtle}>Active profiles: {loading ? '...' : stats.activeAthleteProfiles}</p>
          </article>
        </div>
      </section>

      <section className={styles.userSection}>
        <h2>Athlete Snapshot</h2>
        {userSnapshot ? (
          <div className={styles.userGrid}>
            <article className={styles.userCard}><h3>Current Plan</h3><p>{userSnapshot.planName}</p></article>
            <article className={styles.userCard}><h3>Goal</h3><p>{userSnapshot.goal}</p></article>
            <article className={styles.userCard}><h3>Age / Weight</h3><p>{userSnapshot.age ?? 'N/A'} yrs • {userSnapshot.weight ?? 'N/A'} kg</p></article>
            <article className={styles.userCard}><h3>FTP / Max HR</h3><p>{userSnapshot.ftp ?? 'N/A'} W • {userSnapshot.maxHeartRate ?? 'N/A'} bpm</p></article>
            <article className={styles.userCard}><h3>Power Meter</h3><p>{userSnapshot.hasPowerMeter ? 'Enabled' : 'Not enabled'}</p></article>
          </div>
        ) : (
          <p className={styles.emptyState}>No user profile loaded yet. Create a plan to populate athlete data.</p>
        )}
      </section>

      <section className={styles.dailySnapshotSection}>
        <div className={styles.dailySnapshotHeader}>
          <h2>Daily Snapshot</h2>
          <p>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
        </div>

        <div className={styles.dailySnapshotGrid}>
          <article className={styles.dailyCard}>
            <h3>Today&apos;s Sessions</h3>
            {!loading && dailySnapshotSummary.sessionsCount > 0 && (
              <p className={styles.dailyCardSummary}>
                {dailySnapshotSummary.sessionsCount} sessions • {dailySnapshotSummary.totalMinutes} min total
              </p>
            )}
            {loading ? (
              <p className={styles.emptyState}>Loading today&apos;s sessions...</p>
            ) : dailySessions.length === 0 ? (
              <p className={styles.emptyState}>No scheduled sessions today across your saved plans.</p>
            ) : (
              <ul className={styles.dailyList}>
                {dailySessions.map((session) => (
                  <li key={`${session.planId}-${session.sessionId}`} className={styles.dailyListItem}>
                    <span className={styles.dailySessionType}>{session.type}</span>
                    <span className={styles.dailySessionMeta}>
                      {session.duration} min • {session.intensity}
                    </span>
                    <span className={styles.dailySessionPlan}>{session.planName}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className={styles.dailyCard}>
            <h3>Nutrition Tips for Today</h3>
            {loading ? (
              <p className={styles.emptyState}>Loading tips...</p>
            ) : dailyNutritionTips.length === 0 ? (
              <p className={styles.emptyState}>No session-driven nutrition tips for today.</p>
            ) : (
              <ul className={styles.dailyList}>
                {dailyNutritionTips.map((tip, index) => (
                  <li key={`tip-${index}`} className={styles.dailyTipItem}>{tip}</li>
                ))}
              </ul>
            )}
          </article>

          <article className={styles.dailyCard}>
            <ReadinessCheckIn
              date={formatLocalDateKey(new Date())}
              existingEntry={dailyReadiness}
              onSave={async (entry) => {
                await storage.saveDailyReadiness(entry)
                setDailyReadiness(entry)
              }}
            />
          </article>
        </div>

        <article className={`${styles.readinessImpactCard} ${styles[`readinessImpact${dailyReadinessImpact.tone[0].toUpperCase()}${dailyReadinessImpact.tone.slice(1)}`]}`}>
          <h3>{dailyReadinessImpact.title}</h3>
          <p>{dailyReadinessImpact.message}</p>
          {dailyReadinessNote && (
            <p className={styles.readinessCoachNote} title={dailyReadinessNote.full}>
              Context from notes: {dailyReadinessNote.preview}
            </p>
          )}
        </article>
      </section>

      <section className={styles.widgetsSection}>
        <div className={styles.widgetsHeader}>
          <h2>Configurable Widgets</h2>
          <p>Choose which graphs appear on your home dashboard.</p>
        </div>
        <div className={styles.widgetToggles}>
          {DEFAULT_WIDGETS.map((widgetKey) => (
            <label key={widgetKey} className={styles.widgetToggle}>
              <input
                type="checkbox"
                checked={enabledWidgets.includes(widgetKey)}
                onChange={() => toggleWidget(widgetKey)}
              />
              <span>{WIDGET_LABELS[widgetKey]}</span>
            </label>
          ))}
        </div>

        <div className={styles.widgetOrderStrip}>
          <p>Widget order: drag to reorder</p>
          <div className={styles.widgetOrderList}>
            {enabledWidgets.map((widgetKey) => (
              <button
                key={widgetKey}
                type="button"
                className={styles.widgetOrderChip}
                draggable
                onDragStart={() => setDraggedWidget(widgetKey)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedWidget) {
                    moveWidget(draggedWidget, widgetKey)
                    setDraggedWidget(null)
                  }
                }}
                onDragEnd={() => setDraggedWidget(null)}
                aria-label={`Move ${WIDGET_LABELS[widgetKey]}`}
              >
                <GripIcon size={14} />
                <span>{WIDGET_LABELS[widgetKey]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.widgetsGrid}>
          {enabledWidgets.map((widgetKey) => {
            if (widgetKey === 'ridesByWeek') {
              return (
                <article key={widgetKey} className={styles.widgetCard}>
                  <h3>Rides by Week</h3>
                  {weeklyRideSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={weeklyRideSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dce8f4" />
                        <XAxis dataKey="week" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="rides" fill="#1f5f9a" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className={styles.emptyState}>No synced rides yet. Connect Intervals and run a sync.</p>
                  )}
                </article>
              )
            }

            if (widgetKey === 'rideHoursByWeek') {
              return (
                <article key={widgetKey} className={styles.widgetCard}>
                  <h3>Ride Hours by Week</h3>
                  {weeklyRideSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={weeklyRideSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dce8f4" />
                        <XAxis dataKey="week" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="hours" fill="#2f8f57" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className={styles.emptyState}>No synced rides yet. Connect Intervals and run a sync.</p>
                  )}
                </article>
              )
            }

            return (
              <article key={widgetKey} className={styles.widgetCard}>
                <h3>Ride Intensity Mix</h3>
                {rideIntensityMixSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={rideIntensityMixSeries} dataKey="count" nameKey="bucket" outerRadius={84} label>
                        {rideIntensityMixSeries.map((entry) => (
                          <Cell key={entry.bucket} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.emptyState}>No synced rides with intensity data yet.</p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className={styles.syncSection}>
        <h2>Sync Status</h2>
        <p>
          Last sync: <strong>{syncLabel}</strong>
        </p>
        <p>
          State: <strong>{stats.syncStatus}</strong>
        </p>
      </section>
    </div>
  )
}

function normalizeRideHours(duration?: number): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  // Intervals payloads can vary by source; values above 600 are treated as seconds.
  return duration > 600 ? duration / 3600 : duration / 60
}

function getWeekStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  const dayIndex = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dayIndex)
  return date.getTime()
}

function formatWeekLabel(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function resolveRideIntensityFactor(ride: RideCacheEntry): number {
  const intensity = ride.intensity
  if (typeof intensity === 'number' && Number.isFinite(intensity) && intensity > 0) {
    return intensity > 2 ? intensity / 100 : intensity
  }

  const normalizedPower = ride.normalizedPower
  const ftp = ride.ftpWatts
  if (
    typeof normalizedPower === 'number' &&
    Number.isFinite(normalizedPower) &&
    normalizedPower > 0 &&
    typeof ftp === 'number' &&
    Number.isFinite(ftp) &&
    ftp > 0
  ) {
    return normalizedPower / ftp
  }

  return 0
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultNutritionTipForSession(
  type: string,
  intensity: 'easy' | 'moderate' | 'hard' | 'very_hard',
  durationMinutes: number
): string {
  if (type === 'recovery' || durationMinutes <= 30) {
    return 'Keep meals light and focus on hydration and micronutrient-rich foods.'
  }

  if (intensity === 'very_hard' || intensity === 'hard') {
    return 'Prioritize carbs pre-ride and add a protein-rich recovery meal within 45 minutes after training.'
  }

  if (durationMinutes >= 90) {
    return 'Long day: increase carbs at breakfast and include electrolyte hydration during training.'
  }

  return 'Use balanced meals with easy-to-digest carbs and moderate protein to support steady training.'
}

function getIntensityRank(intensity: 'easy' | 'moderate' | 'hard' | 'very_hard'): number {
  if (intensity === 'very_hard') return 4
  if (intensity === 'hard') return 3
  if (intensity === 'moderate') return 2
  return 1
}

function getSessionPriorityScore(type: string): number {
  if (type === 'vo2max') return 7
  if (type === 'anaerobic') return 6
  if (type === 'threshold') return 5
  if (type === 'tempo') return 4
  if (type === 'endurance') return 3
  if (type === 'strength') return 2
  if (type === 'recovery') return 1
  return 0
}
