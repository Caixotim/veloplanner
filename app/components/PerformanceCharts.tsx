'use client'

import React from 'react'
import { Line, LineChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, AreaChart, ReferenceLine } from 'recharts'
import type { BodyMetricsEntry, EventPriority, TrainingPlan, UserProfile } from '@/app/lib/types'
import { buildDailyLoadSeries, summarizeLoadSeries } from '@/app/lib/loadModel'
import { computeWeeklyCompliance } from '@/app/lib/compliance'
import { computeIntensityDistribution } from '@/app/lib/intensityDistribution'
import { computePeakProgressionSummary, computeSessionExecutionSummary, computeTaperAdvisor } from '@/app/lib/performanceInsights'
import { computeReadinessZoneDistribution, computeRacePrepStatuses, computeSessionTypeExecution, computeWeeklyStressTimeline } from '@/app/lib/trainingPeaksLike'
import { computeThresholdHistory, computeZoneVersions, summarizeThresholdTrend } from '@/app/lib/thresholdHistory'
import { computeRampGuidance, computeWeeklyRampTimeline } from '@/app/lib/rampModel'
import { computeFreshnessScore, computeMonotonyIndex, computeSeasonPhaseOverview, computeWeeklyPlanSuggestion } from '@/app/lib/athleteMetrics'
import styles from './PerformanceCharts.module.scss'

/**
 * Props for the PerformanceCharts component
 */
interface PerformanceChartsProps {
  plan: TrainingPlan
  ftpTargetOverride?: number
  onCoachActionSelect?: (actionKey: string | null) => void
  plannedEvents?: UserProfile['plannedEvents']
  intervalsRideData?: Array<{
    date: number
    maxPower: number
    avgPower?: number
    normalizedPower?: number
    ftpWatts?: number
    avgHR: number
    duration: number // minutes
    distance: number // km
  }>
  bodyMetrics?: BodyMetricsEntry[]
}

type AssessmentStatus = 'good' | 'watch' | 'risk' | 'neutral'

type AssessmentMetric = {
  label: string
  value: string
  status: AssessmentStatus
  detail: string
}

type CoachAction = {
  key: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
}

/**
 * Displays performance analytics with charts
 */
export default function PerformanceCharts({
  plan,
  ftpTargetOverride,
  onCoachActionSelect,
  plannedEvents = [],
  intervalsRideData = [],
  bodyMetrics = [],
}: PerformanceChartsProps) {
  const [selectedCoachActionKey, setSelectedCoachActionKey] = React.useState<string | null>(null)
  const [openSections, setOpenSections] = React.useState({
    actual: true,
    planned: true,
    assessment: true,
    stats: true,
  })
  const ridesWithPower = intervalsRideData
    .map((ride) => ({
      power: ride.avgPower || ride.normalizedPower || 0,
      duration: ride.duration || 0,
    }))
    .filter((ride) => ride.power > 0)

  const avgPowerFromRides =
    ridesWithPower.length > 0
      ? Math.round(
          ridesWithPower.reduce((sum, ride) => sum + ride.power * Math.max(ride.duration, 1), 0) /
            ridesWithPower.reduce((sum, ride) => sum + Math.max(ride.duration, 1), 0)
        )
      : 0

  const ftpFromRides = (() => {
    const ftpCandidates = intervalsRideData.map((ride) => ride.ftpWatts || 0).filter((value) => value > 0)
    if (ftpCandidates.length > 0) {
      return Math.round(ftpCandidates.reduce((sum, value) => sum + value, 0) / ftpCandidates.length)
    }

    const normalizedCandidates = intervalsRideData.map((ride) => ride.normalizedPower || 0).filter((value) => value > 0)
    if (normalizedCandidates.length > 0) {
      return Math.round(Math.max(...normalizedCandidates) * 0.95)
    }

    return 0
  })()

  const effectiveFtpTarget = ftpTargetOverride || plan.targetMetrics.ftpTarget || (ftpFromRides > 0 ? ftpFromRides : 250)
  const hasRideData = intervalsRideData.length > 0
  const loadSeries = React.useMemo(
    () =>
      buildDailyLoadSeries({
        plan,
        rides: intervalsRideData,
        ftpFallback: effectiveFtpTarget > 0 ? effectiveFtpTarget : undefined,
      }),
    [effectiveFtpTarget, intervalsRideData, plan]
  )
  const loadSummary = React.useMemo(() => summarizeLoadSeries(loadSeries), [loadSeries])
  const pmcChartData = React.useMemo(() => loadSeries.slice(-56), [loadSeries])
  const weeklyCompliance = React.useMemo(
    () => computeWeeklyCompliance({ plan, rides: intervalsRideData, loadSeries }).slice(-4).reverse(),
    [intervalsRideData, loadSeries, plan]
  )
  const intensityDistribution = React.useMemo(
    () =>
      computeIntensityDistribution({
        plan,
        rides: intervalsRideData,
        ftpFallback: effectiveFtpTarget > 0 ? effectiveFtpTarget : undefined,
      }),
    [effectiveFtpTarget, intervalsRideData, plan]
  )
  const sessionExecutionSummary = React.useMemo(() => computeSessionExecutionSummary(plan, loadSeries), [loadSeries, plan])
  const peakProgression = React.useMemo(() => computePeakProgressionSummary(intervalsRideData), [intervalsRideData])
  const weeksToPlanEnd = React.useMemo(() => {
    const today = new Date()
    const diffMs = new Date(plan.endDate).getTime() - today.getTime()
    return Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)))
  }, [plan.endDate])
  const taperAdvisor = React.useMemo(
    () =>
      computeTaperAdvisor({
        goal: plan.goal,
        weeksToPlanEnd,
        currentTsb: loadSummary.currentTsb,
        projectedTsb7d: loadSummary.projectedTsb7d,
        currentRamp7d: loadSummary.currentRamp7d,
      }),
    [loadSummary.currentRamp7d, loadSummary.currentTsb, loadSummary.projectedTsb7d, plan.goal, weeksToPlanEnd]
  )
  const weeklyStressTimeline = React.useMemo(() => computeWeeklyStressTimeline(plan, loadSeries), [loadSeries, plan])
  const sessionTypeExecution = React.useMemo(() => computeSessionTypeExecution(plan, loadSeries), [loadSeries, plan])
  const readinessZones = React.useMemo(() => computeReadinessZoneDistribution(loadSeries, 28), [loadSeries])
  const racePrepStatuses = React.useMemo(
    () =>
      computeRacePrepStatuses(
        plan,
        intervalsRideData,
        loadSeries,
        (plannedEvents || []).map((e) => ({ ...e, priority: e.priority as string }))
      ),
    [intervalsRideData, loadSeries, plan, plannedEvents]
  )
  const rampTimeline = React.useMemo(() => computeWeeklyRampTimeline(loadSeries), [loadSeries])
  const rampGuidance = React.useMemo(
    () => computeRampGuidance(loadSeries, loadSummary.currentCtl),
    [loadSeries, loadSummary.currentCtl]
  )
  const seasonPhaseOverview = React.useMemo(() => computeSeasonPhaseOverview(plan), [plan])
  const monotonyIndex = React.useMemo(() => computeMonotonyIndex(loadSeries, 14), [loadSeries])
  const weeklyCompletionPct = React.useMemo(
    () =>
      computeWeeklyCompliance({ plan, rides: intervalsRideData, loadSeries })
        .slice(-1)[0]?.completionPct ?? 0,
    [intervalsRideData, loadSeries, plan]
  )
  const freshnessScore = React.useMemo(
    () => computeFreshnessScore(loadSummary.currentTsb, loadSummary.currentRamp7d, weeklyCompletionPct),
    [loadSummary.currentRamp7d, loadSummary.currentTsb, weeklyCompletionPct]
  )
  const currentPhase = React.useMemo(() => {
    const today = new Date()
    const planStart = new Date(plan.startDate)
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const weekIndex = Math.max(0, Math.floor((today.getTime() - planStart.getTime()) / msPerWeek))
    return plan.weeks[weekIndex]?.phase ?? plan.weeks[plan.weeks.length - 1]?.phase ?? 'base'
  }, [plan])
  const daysToNextAEvent = React.useMemo(() => {
    const today = new Date()
    const aEvents = (plannedEvents || [])
      .filter((e) => e.priority === 'A' && e.date)
      .map((e) => ({ ...e, ms: new Date(e.date).getTime() }))
      .filter((e) => Number.isFinite(e.ms) && e.ms >= today.getTime())
      .sort((a, b) => a.ms - b.ms)
    if (aEvents.length === 0) return -1
    return Math.floor((aEvents[0].ms - today.getTime()) / (24 * 60 * 60 * 1000))
  }, [plannedEvents])
  const weeklyPlanSuggestion = React.useMemo(
    () =>
      computeWeeklyPlanSuggestion({
        freshnessCategory: freshnessScore.category,
        currentPhase,
        goal: plan.goal,
        daysToNextAEvent,
        rampStatus: rampGuidance.status,
      }),
    [currentPhase, daysToNextAEvent, freshnessScore.category, plan.goal, rampGuidance.status]
  )
  const thresholdHistory = React.useMemo(
    () => computeThresholdHistory(intervalsRideData, effectiveFtpTarget > 0 ? effectiveFtpTarget : undefined),
    [effectiveFtpTarget, intervalsRideData]
  )
  const zoneVersions = React.useMemo(() => computeZoneVersions(thresholdHistory), [thresholdHistory])
  const thresholdTrend = React.useMemo(() => summarizeThresholdTrend(thresholdHistory), [thresholdHistory])
  const latestZoneVersion = zoneVersions[zoneVersions.length - 1]
  const eventReadiness = React.useMemo(() => {
    const tsbByDate = new Map(loadSeries.map((point) => [point.date, point.tsb]))
    const priorityScore = (priority: EventPriority): number => {
      if (priority === 'A') return 3
      if (priority === 'B') return 2
      return 1
    }

    return (plannedEvents || [])
      .filter((event) => event.name && event.date)
      .map((event) => {
        const tsb = tsbByDate.get(event.date)
        const status =
          tsb === undefined
            ? 'unknown'
            : tsb < -8
            ? 'risk'
            : tsb > 12
            ? 'watch'
            : 'good'

        return {
          ...event,
          tsb,
          status,
        }
      })
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date)
        if (byDate !== 0) return byDate
        return priorityScore(b.priority) - priorityScore(a.priority)
      })
  }, [loadSeries, plannedEvents])
  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #d6dde8',
    borderRadius: 8,
    boxShadow: '0 8px 18px rgba(12, 32, 64, 0.12)',
  }
  const tooltipLabelStyle = { color: '#223142', fontWeight: 700 }
  const tooltipItemStyle = { color: '#33465c' }

  // Generate training load heatmap data
  const volumeData = plan.weeks.map((week, idx) => {
    const intensity = week.sessions.reduce((sum, s) => {
      const intensityMap = { easy: 1, moderate: 2, hard: 3, very_hard: 4 }
      return sum + (intensityMap[s.intensity] || 0)
    }, 0)

    return {
      week: idx + 1,
      volume: week.totalHours,
      intensity,
      date: `W${idx + 1}`,
    }
  })

  // Generate power curve from synced Intervals.icu rides (84-day planner window)
  const powerCurveData = [
    { duration: '5s', power: intervalsRideData.length > 0 ? Math.max(...intervalsRideData.map(r => r.maxPower)) : 0 },
    { duration: '1m', power: intervalsRideData.length > 0 ? Math.round(Math.max(...intervalsRideData.map(r => r.maxPower)) * 0.95) : 0 },
    { duration: '5m', power: intervalsRideData.length > 0 ? Math.round(Math.max(...intervalsRideData.map(r => r.maxPower)) * 0.85) : 0 },
    { duration: '20m', power: effectiveFtpTarget },
    { duration: '1h', power: Math.round((effectiveFtpTarget * 0.75) * 1.1) },
  ]

  // HR trend from latest synced rides
  const hrTrendData = intervalsRideData.slice(-21).map((ride, idx) => ({
    day: idx + 1,
    avgHR: ride.avgHR,
    zone2: Math.round(ride.avgHR * 0.65),
    zone3: Math.round(ride.avgHR * 0.75),
    zone4: Math.round(ride.avgHR * 0.85),
  }))

  const bodyMetricsChartData = React.useMemo(
    () =>
      bodyMetrics.map((entry) => ({
        date: entry.date.slice(5),
        fullDate: entry.date,
        weightKg: entry.weightKg,
        restingHr: entry.restingHr,
        hrvMs: entry.hrvMs,
      })),
    [bodyMetrics]
  )

  const riderAssessment = React.useMemo(() => {
    const strengths: string[] = []
    const improvements: string[] = []
    const metrics: AssessmentMetric[] = []
    const actions: CoachAction[] = []

    if (!hasRideData) {
      return {
        strengths: ['Plan analytics is ready and awaiting ride sync.'],
        improvements: ['Sync Intervals.icu rides to enable athlete-specific assessment.'],
        actions: [
          {
            key: 'sync_recent_rides',
            title: 'Sync Recent Rides',
            detail: 'Import at least 2-4 weeks of rides so readiness, durability, and pacing recommendations can be personalized.',
            priority: 'high' as const,
          },
          {
            key: 'maintain_progression',
            title: 'Keep Following Plan Structure',
            detail: 'Continue executing planned sessions while data backfills; assessment depth will improve automatically.',
            priority: 'low' as const,
          },
        ],
        metrics: [
          {
            label: 'Load Balance (TSB proxy)',
            value: 'No data',
            status: 'neutral' as AssessmentStatus,
            detail: 'Sync rides to estimate Fitness/Fatigue/Form style readiness.',
          },
          {
            label: 'Durability',
            value: 'No data',
            status: 'neutral' as AssessmentStatus,
            detail: 'Requires FTP and sustained ride power to assess aerobic durability.',
          },
        ],
      }
    }

    const rideCount = intervalsRideData.length
    const maxPowerPeak = Math.max(...intervalsRideData.map((ride) => ride.maxPower || 0), 0)
    const avgHrValues = hrTrendData.map((point) => point.avgHR).filter((value) => value > 0)
    const weeklyRideRate = rideCount / 12

    const atlProxy = loadSummary.currentAtl
    const ctlProxy = loadSummary.currentCtl
    const tsbProxy = loadSummary.currentTsb

    if (tsbProxy >= 5) {
      metrics.push({
        label: 'Load Balance (TSB proxy)',
        value: `${tsbProxy.toFixed(1)} (Fresh)`,
        status: 'good',
        detail: `Proxy uses a CTL/ATL-style model from synced ride stress. CTL ${ctlProxy.toFixed(1)} vs ATL ${atlProxy.toFixed(1)}.`,
      })
    } else if (tsbProxy <= -10) {
      metrics.push({
        label: 'Load Balance (TSB proxy)',
        value: `${tsbProxy.toFixed(1)} (Heavy)`,
        status: 'risk',
        detail: `Short-term fatigue is high versus background load (CTL ${ctlProxy.toFixed(1)} / ATL ${atlProxy.toFixed(1)}).`,
      })
    } else {
      metrics.push({
        label: 'Load Balance (TSB proxy)',
        value: `${tsbProxy.toFixed(1)} (Balanced)`,
        status: 'watch',
        detail: `Moderate training strain with acceptable fatigue balance (CTL ${ctlProxy.toFixed(1)} / ATL ${atlProxy.toFixed(1)}).`,
      })
    }

    if (tsbProxy <= -10) {
      actions.push({
        key: 'reduce_fatigue',
        title: 'Reduce Fatigue This Week',
        detail: 'Schedule 1 full rest day and replace one hard workout with 45-60 minutes easy Z2 to bring ATL down.',
        priority: 'high',
      })
    } else if (tsbProxy >= 5) {
      actions.push({
        key: 'use_freshness_quality',
        title: 'Use Freshness for Quality',
        detail: 'Keep one key intensity session (threshold or VO2) and execute it early in the week while form is positive.',
        priority: 'medium',
      })
    }

    if (rideCount >= 12) {
      strengths.push(`Good consistency: ${rideCount} rides analyzed in the recent synced window.`)
    } else {
      improvements.push(`Low recent consistency (${rideCount} rides). Aim for at least 12 rides per 84 days.`)
    }

    if (weeklyRideRate < 2.5) {
      actions.push({
        key: 'raise_session_frequency',
        title: 'Raise Session Frequency',
        detail: 'Add one short 45-60 minute endurance ride this week to improve consistency before increasing intensity.',
        priority: weeklyRideRate < 2 ? 'high' : 'medium',
      })
    }

    if (weeklyRideRate >= 3) {
      metrics.push({
        label: 'Consistency Rate',
        value: `${weeklyRideRate.toFixed(1)} rides/week`,
        status: 'good',
        detail: 'Frequency is high enough to support steady progression for most plan goals.',
      })
    } else if (weeklyRideRate >= 2) {
      metrics.push({
        label: 'Consistency Rate',
        value: `${weeklyRideRate.toFixed(1)} rides/week`,
        status: 'watch',
        detail: 'Adequate, but adding one additional quality session per week would improve adaptation.',
      })
    } else {
      metrics.push({
        label: 'Consistency Rate',
        value: `${weeklyRideRate.toFixed(1)} rides/week`,
        status: 'risk',
        detail: 'Current frequency is low for meaningful progression. Prioritize schedule adherence first.',
      })
    }

    if (ftpFromRides > 0 && avgPowerFromRides > 0) {
      const durabilityRatio = avgPowerFromRides / ftpFromRides
      if (durabilityRatio >= 0.75) {
        strengths.push(`Strong aerobic durability: average power is ${(durabilityRatio * 100).toFixed(0)}% of FTP estimate.`)
        metrics.push({
          label: 'Durability',
          value: `${(durabilityRatio * 100).toFixed(0)}% of FTP`,
          status: 'good',
          detail: 'Sustained output relative to threshold suggests durable aerobic support.',
        })
      } else {
        improvements.push(`Aerobic durability can improve: average power is ${(durabilityRatio * 100).toFixed(0)}% of FTP estimate.`)
        metrics.push({
          label: 'Durability',
          value: `${(durabilityRatio * 100).toFixed(0)}% of FTP`,
          status: 'watch',
          detail: 'Below durable range. Add longer Z2 and steady tempo blocks to raise fatigue resistance.',
        })
      }

      if (durabilityRatio < 0.72) {
        actions.push({
          key: 'build_aerobic_durability',
          title: 'Build Aerobic Durability',
          detail: 'Include one long Z2 session (90-150 minutes) and one tempo block session (2x12 to 3x12 minutes).',
          priority: 'high',
        })
      }
    }

    if (ftpFromRides > 0) {
      const snapRatio = maxPowerPeak / ftpFromRides
      if (snapRatio >= 1.8) {
        strengths.push(`Good top-end snap: peak sprint power reaches ${(snapRatio * 100).toFixed(0)}% of FTP.`)
        metrics.push({
          label: 'Top-End Power',
          value: `${(snapRatio * 100).toFixed(0)}% of FTP`,
          status: 'good',
          detail: 'Strong neuromuscular capacity relative to threshold power.',
        })
      } else {
        improvements.push('Top-end repeatability may need work: consider adding sprint neuromuscular work weekly.')
        metrics.push({
          label: 'Top-End Power',
          value: `${(snapRatio * 100).toFixed(0)}% of FTP`,
          status: 'watch',
          detail: 'Top-end appears muted versus threshold. Add short sprint and acceleration work.',
        })
      }
    }

    if (avgHrValues.length >= 6) {
      const meanHr = avgHrValues.reduce((sum, value) => sum + value, 0) / avgHrValues.length
      const variance = avgHrValues.reduce((sum, value) => sum + (value - meanHr) ** 2, 0) / avgHrValues.length
      const cv = meanHr > 0 ? Math.sqrt(variance) / meanHr : 0

      if (cv <= 0.1) {
        strengths.push(`Heart-rate control is stable (variation ${(cv * 100).toFixed(1)}%).`)
        metrics.push({
          label: 'Cardiac Stability',
          value: `${(cv * 100).toFixed(1)}% CV`,
          status: 'good',
          detail: 'Stable HR trend suggests sound pacing and manageable internal load.',
        })
      } else {
        improvements.push(`Heart-rate variability is elevated (${(cv * 100).toFixed(1)}%). Review pacing and recovery quality.`)
        metrics.push({
          label: 'Cardiac Stability',
          value: `${(cv * 100).toFixed(1)}% CV`,
          status: 'risk',
          detail: 'Elevated variability can indicate pacing inconsistency, heat/load strain, or poor recovery.',
        })
      }

      if (cv > 0.1) {
        actions.push({
          key: 'stabilize_internal_load',
          title: 'Stabilize Internal Load',
          detail: 'Keep easy days truly easy, hydrate/fuel consistently, and avoid stacking hard sessions on back-to-back days.',
          priority: 'medium',
        })
      }
    }

    if (ftpFromRides > 0 && effectiveFtpTarget > 0) {
      const ftpGapPct = ((effectiveFtpTarget - ftpFromRides) / ftpFromRides) * 100
      if (ftpGapPct <= 4) {
        metrics.push({
          label: 'Plan vs Current FTP',
          value: `${ftpGapPct >= 0 ? '+' : ''}${ftpGapPct.toFixed(1)}%`,
          status: 'good',
          detail: 'Target FTP is close to current estimate and appears realistic for near-term execution.',
        })
      } else if (ftpGapPct <= 10) {
        metrics.push({
          label: 'Plan vs Current FTP',
          value: `+${ftpGapPct.toFixed(1)}%`,
          status: 'watch',
          detail: 'Target is moderately ambitious; ensure consistency before adding more intensity.',
        })
      } else {
        metrics.push({
          label: 'Plan vs Current FTP',
          value: `+${ftpGapPct.toFixed(1)}%`,
          status: 'risk',
          detail: 'Target may be too aggressive for the current signal. Consider staged FTP milestones.',
        })
      }

      if (ftpGapPct > 10) {
        actions.push({
          key: 'stage_ftp_progression',
          title: 'Stage FTP Progression',
          detail: 'Break the target into smaller milestones (for example +3% then +3%) and re-test after each 4-week block.',
          priority: 'medium',
        })
      }
    }

    if (strengths.length === 0) {
      strengths.push('No clear standout detected yet; continue collecting rides for stronger signal.')
    }

    if (improvements.length === 0) {
      improvements.push('No major weaknesses detected in this sample. Keep current progression and monitor fatigue.')
    }

    if (actions.length === 0) {
      actions.push({
        key: 'maintain_progression',
        title: 'Maintain Current Progression',
        detail: 'Signals are stable. Keep plan adherence high and reassess after another 1-2 weeks of rides.',
        priority: 'low',
      })
    }

    const priorityRank: Record<CoachAction['priority'], number> = {
      high: 0,
      medium: 1,
      low: 2,
    }
    const dedupedActions = actions
      .filter((action, index, arr) => arr.findIndex((item) => item.title === action.title) === index)
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
      .slice(0, 3)

    return { strengths, improvements, metrics, actions: dedupedActions }
  }, [avgPowerFromRides, effectiveFtpTarget, ftpFromRides, hasRideData, hrTrendData, intervalsRideData, loadSummary])

  const handleCoachActionClick = (actionKey: string) => {
    const nextKey = selectedCoachActionKey === actionKey ? null : actionKey
    setSelectedCoachActionKey(nextKey)
    onCoachActionSelect?.(nextKey)
  }

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const allSectionsExpanded = Object.values(openSections).every(Boolean)

  const handleExpandAllSections = () => {
    setOpenSections({
      actual: true,
      planned: true,
      assessment: true,
      stats: true,
    })
  }

  const handleCollapseAllSections = () => {
    setOpenSections({
      actual: false,
      planned: false,
      assessment: false,
      stats: false,
    })
  }

  const expandSectionFromNav = (section: keyof typeof openSections, targetId: string) => {
    setOpenSections((current) => ({
      ...current,
      [section]: true,
    }))

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(targetId)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  return (
    <div className={styles.chartsContainer}>
      <h2>Performance Analytics</h2>

      {bodyMetricsChartData.length > 0 && (
        <section className={styles.bodyMetricsCard} aria-label="Body metrics trend">
          <div className={styles.bodyMetricsHeader}>
            <div>
              <h3>Body Metrics Trend</h3>
              <p>Track weight, resting HR, and HRV changes alongside training load.</p>
            </div>
          </div>
          <div className={styles.bodyMetricsChart}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={bodyMetricsChartData} margin={{ top: 10, right: 18, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ebf4" />
                <XAxis dataKey="date" tick={{ fill: '#58708a', fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: '#58708a', fontSize: 11 }} width={42} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#58708a', fontSize: 11 }} width={42} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="weightKg" name="Weight (kg)" stroke="#1f6fd6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="restingHr" name="Resting HR" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="hrvMs" name="HRV (ms)" stroke="#2f8f57" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className={styles.loadSummaryStrip} aria-label="Current load summary">
        <article className={styles.loadSummaryCard}>
          <span>CTL</span>
          <strong>{loadSummary.currentCtl.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>ATL</span>
          <strong>{loadSummary.currentAtl.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>TSB</span>
          <strong>{loadSummary.currentTsb.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>7d Planned Stress</span>
          <strong>{loadSummary.weeklyStressPlanned.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>7d Completed Stress</span>
          <strong>{loadSummary.weeklyStressCompleted.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>7d Ramp</span>
          <strong>{loadSummary.currentRamp7d.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>Next 7d Planned Stress</span>
          <strong>{loadSummary.plannedStressNext7d.toFixed(1)}</strong>
        </article>
        <article className={styles.loadSummaryCard}>
          <span>Projected TSB (+7d)</span>
          <strong>{loadSummary.projectedTsb7d.toFixed(1)}</strong>
        </article>
        <article className={`${styles.loadSummaryCard} ${styles[`freshnessCard_${freshnessScore.category}`] || ''}`}>
          <span>Freshness</span>
          <strong>{freshnessScore.score}</strong>
          <span className={styles.freshnessLabel}>{freshnessScore.label}</span>
        </article>
      </section>

      <nav className={styles.quickNav} aria-label="Performance analytics sections">
        <button type="button" className={styles.quickNavLink} onClick={() => expandSectionFromNav('actual', 'analytics-actual')}>Actual Data</button>
        <button type="button" className={styles.quickNavLink} onClick={() => expandSectionFromNav('planned', 'analytics-planned')}>Planned Load</button>
        <button type="button" className={styles.quickNavLink} onClick={() => expandSectionFromNav('assessment', 'analytics-assessment')}>Rider Assessment</button>
        <button type="button" className={styles.quickNavLink} onClick={() => expandSectionFromNav('stats', 'analytics-stats')}>Summary Stats</button>
        <div className={styles.quickNavControls}>
          <button
            type="button"
            className={styles.quickNavControlBtn}
            onClick={handleExpandAllSections}
            disabled={allSectionsExpanded}
          >
            Expand all
          </button>
          <button
            type="button"
            className={styles.quickNavControlBtn}
            onClick={handleCollapseAllSections}
            disabled={!Object.values(openSections).some(Boolean)}
          >
            Collapse all
          </button>
        </div>
      </nav>

      <section id="analytics-actual" className={styles.analyticsSection}>
      <div className={styles.sectionHeaderCollapsible}>
        <div className={styles.sectionHeaderMain}>
          <h3>Actual Performance</h3>
          <p>Based on executed workouts from your Intervals.icu 84-day synced ride window.</p>
        </div>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection('actual')}
          aria-expanded={openSections.actual}
          aria-controls="analytics-actual-content"
        >
          {openSections.actual ? 'Hide' : 'Show'}
          <span className={styles.sectionToggleIcon}>{openSections.actual ? '▾' : '▸'}</span>
        </button>
      </div>
      {openSections.actual && <div id="analytics-actual-content" className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitleRow}>
            <h3>Power Curve</h3>
            <div className={styles.chartTitleActions}>
              <span className={styles.helpIcon} tabIndex={0} data-tooltip="Shows peak capability from sprint to longer efforts. Hover bars to view watts.">?</span>
              <span className={styles.sourcePill}>Synced Data</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={powerCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
              <XAxis dataKey="duration" stroke="#60748a" tick={{ fill: '#60748a' }} />
              <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(value, name) => [`${Math.round(Number(value ?? 0))} W`, String(name)]}
                labelFormatter={(label) => `Duration: ${String(label ?? '')}`}
              />
              <Bar dataKey="power" fill="#1f6fd6" name="Peak Power (W)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {hrTrendData.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Heart Rate Trend (Recent 21 Rides)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="Shows heart-rate drift and stability across recent rides. Hover to inspect each point.">?</span>
                <span className={styles.sourcePill}>Synced Data</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={hrTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="day" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => [`${Math.round(Number(value ?? 0))} bpm`, String(name)]}
                  labelFormatter={(label) => `Ride #${String(label ?? '')}`}
                />
                <Legend />
                <Area type="monotone" dataKey="avgHR" fill="#ff8f1f" stroke="#ea7c0a" name="Avg HR" />
                <Area type="monotone" dataKey="zone3" fill="#1f6fd6" stroke="#1f6fd6" name="Zone 3" opacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {pmcChartData.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Performance Management (CTL/ATL/TSB)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="Models short-term fatigue (ATL), longer-term fitness (CTL), and form/readiness (TSB) from planned/completed daily stress.">?</span>
                <span className={styles.sourcePill}>Modeled</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={pmcChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="date" stroke="#60748a" tick={{ fill: '#60748a' }} tickFormatter={(value) => String(value).slice(5)} />
                <YAxis yAxisId="left" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => {
                    const key = String(name)
                    if (key === 'Planned Stress' || key === 'Completed Stress') {
                      return [`${Number(value ?? 0).toFixed(1)} pts`, key]
                    }

                    return [`${Number(value ?? 0).toFixed(1)}`, key]
                  }}
                />
                <Legend />
                <Bar yAxisId="right" dataKey="plannedStress" fill="#d4e4f7" name="Planned Stress" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="completedStress" fill="#8cb5e7" name="Completed Stress" radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" dataKey="ctl" type="monotone" stroke="#1f6fd6" strokeWidth={2.4} dot={false} name="CTL" />
                <Line yAxisId="left" dataKey="atl" type="monotone" stroke="#ea7c0a" strokeWidth={2.2} dot={false} name="ATL" />
                <Area yAxisId="left" dataKey="tsb" type="monotone" fill="#97c4ff" stroke="#5f9be7" fillOpacity={0.2} name="TSB" />
                {(plannedEvents || []).filter((e) => e.name && e.date).map((event) => (
                  <ReferenceLine
                    key={`event-ref-${event.id}`}
                    yAxisId="left"
                    x={event.date}
                    stroke={event.priority === 'A' ? '#c0392b' : event.priority === 'B' ? '#e67e22' : '#2980b9'}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{
                      value: `${event.priority}: ${event.name.slice(0, 10)}${event.name.length > 10 ? '…' : ''}`,
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: event.priority === 'A' ? '#c0392b' : event.priority === 'B' ? '#e67e22' : '#2980b9',
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {intervalsRideData.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Peak Progression (Earlier vs Recent)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="Compares estimated best powers from the first and second half of synced rides to reveal trend direction.">?</span>
                <span className={styles.sourcePill}>Synced Data</span>
              </div>
            </div>
            <div className={styles.peakTable}>
              {peakProgression.rows.map((row) => (
                <div key={`peak-${row.duration}`} className={styles.peakRow}>
                  <span className={styles.peakDuration}>{row.duration}</span>
                  <span className={styles.peakPower}>{row.earlierBest.toFixed(0)} W</span>
                  <span className={styles.peakArrow}>{'->'}</span>
                  <span className={styles.peakPower}>{row.recentBest.toFixed(0)} W</span>
                  <span className={`${styles.peakDelta} ${row.deltaPct >= 2 ? styles.peakDeltaUp : row.deltaPct <= -2 ? styles.peakDeltaDown : styles.peakDeltaFlat}`}>
                    {row.deltaPct >= 0 ? '+' : ''}{row.deltaPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.peakStatusText}>
              Trend: <strong>{peakProgression.status === 'improving' ? 'Improving' : peakProgression.status === 'mixed' ? 'Mixed' : 'Flat'}</strong>
            </p>
          </div>
        )}

        {thresholdHistory.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Threshold History & Zone Versions</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="Tracks threshold updates over time and auto-generates power zone versions from each FTP snapshot.">?</span>
                <span className={styles.sourcePill}>Synced Data</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={thresholdHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="versionLabel" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => [`${Number(value ?? 0).toFixed(0)} W`, String(name)]}
                  labelFormatter={(label) => `Zone Version ${String(label ?? '')}`}
                />
                <Legend />
                <Line type="monotone" dataKey="ftp" stroke="#1f6fd6" strokeWidth={2.4} dot={{ r: 3 }} name="FTP" />
              </LineChart>
            </ResponsiveContainer>

            <div className={styles.thresholdTrendRow}>
              <span>Trend</span>
              <strong>
                {thresholdTrend.deltaWatts >= 0 ? '+' : ''}
                {thresholdTrend.deltaWatts.toFixed(1)} W ({thresholdTrend.deltaPct >= 0 ? '+' : ''}
                {thresholdTrend.deltaPct.toFixed(1)}%)
              </strong>
            </div>

            {latestZoneVersion && (
              <div className={styles.zoneVersionCard}>
                <h4>
                  Active Zone Version {latestZoneVersion.versionLabel} ({latestZoneVersion.ftp}W FTP)
                </h4>
                <ul>
                  {latestZoneVersion.zones.map((zone) => (
                    <li key={`${latestZoneVersion.versionLabel}-${zone.name}`}>
                      <span>{zone.name}</span>
                      <strong>{zone.min}-{zone.max} W</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {pmcChartData.length > 0 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Fitness History (CTL over Time)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="CTL (Chronic Training Load) shows your fitness trend. Rising CTL = building fitness. Flat or falling = maintaining or detraining.">?</span>
                <span className={styles.sourcePill}>Modeled</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pmcChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="date" stroke="#60748a" tick={{ fill: '#60748a' }} tickFormatter={(value) => String(value).slice(5)} />
                <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}`, String(name)]}
                />
                <Legend />
                <Area type="monotone" dataKey="ctl" fill="#b8d5f5" stroke="#1f6fd6" fillOpacity={0.35} strokeWidth={2.2} name="CTL (Fitness)" />
                <Area type="monotone" dataKey="atl" fill="#ffd5a8" stroke="#ea7c0a" fillOpacity={0.2} strokeWidth={1.8} name="ATL (Fatigue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {intervalsRideData.length >= 4 && (
          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Personal Records (Best Efforts)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="Best estimated power for sprint, 1-minute, 5-minute, and 20-minute efforts from synced rides.">?</span>
                <span className={styles.sourcePill}>Synced Data</span>
              </div>
            </div>
            <div className={styles.prGrid}>
              {peakProgression.rows.map((row) => (
                <div key={`pr-${row.duration}`} className={styles.prCard}>
                  <span className={styles.prDuration}>{row.duration}</span>
                  <strong className={styles.prBest}>{row.recentBest.toFixed(0)} W</strong>
                  <span className={`${styles.prDeltaBadge} ${row.deltaPct >= 2 ? styles.prDeltaUp : row.deltaPct <= -2 ? styles.prDeltaDown : styles.prDeltaFlat}`}>
                    {row.deltaPct >= 0 ? '+' : ''}{row.deltaPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasRideData && (
          <div className={styles.chartCard}>
            <h3>Ride Data Needed</h3>
            <p className={styles.emptyStateText}>Sync Intervals.icu rides to unlock actual performance analytics.</p>
          </div>
        )}
      </div>}
      </section>

      <section id="analytics-planned" className={styles.analyticsSection}>
      <div className={styles.sectionHeaderCollapsible}>
        <div className={styles.sectionHeaderMain}>
          <h3>Planned Load</h3>
          <p>Generated from the selected plan sessions and periodization, not from completed rides.</p>
        </div>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection('planned')}
          aria-expanded={openSections.planned}
          aria-controls="analytics-planned-content"
        >
          {openSections.planned ? 'Hide' : 'Show'}
          <span className={styles.sectionToggleIcon}>{openSections.planned ? '▾' : '▸'}</span>
        </button>
      </div>
      {openSections.planned && <div id="analytics-planned-content" className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitleRow}>
            <h3>Weekly Volume & Intensity</h3>
            <div className={styles.chartTitleActions}>
              <span className={styles.helpIcon} tabIndex={0} data-tooltip="Volume is planned hours; intensity is planned effort score from session mix.">?</span>
              <span className={styles.sourcePillPlanned}>Plan Data</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
              <XAxis dataKey="date" stroke="#60748a" tick={{ fill: '#60748a' }} />
              <YAxis yAxisId="left" stroke="#60748a" tick={{ fill: '#60748a' }} />
              <YAxis yAxisId="right" orientation="right" stroke="#60748a" tick={{ fill: '#60748a' }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(value, name) => [String(name) === 'Hours' ? `${Number(value ?? 0).toFixed(1)} h` : `${Math.round(Number(value ?? 0))} pts`, String(name)]}
                labelFormatter={(label) => `Plan ${String(label ?? '')}`}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="volume" fill="#1f6fd6" name="Hours" radius={[6, 6, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="intensity" stroke="#ea7c0a" name="Intensity" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitleRow}>
            <h3>Intensity Distribution (Planned vs Completed)</h3>
            <div className={styles.chartTitleActions}>
              <span className={styles.helpIcon} tabIndex={0} data-tooltip="Approximates time in zones Z1-Z5 and highlights whether your executed intensity mix matches polarized training principles.">?</span>
              <span className={styles.sourcePill}>Plan + Synced Data</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={intensityDistribution.zones}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
              <XAxis dataKey="label" stroke="#60748a" tick={{ fill: '#60748a', fontSize: 11 }} interval={0} />
              <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(value, name, payload) => {
                  const key = String(name)
                  const point = payload?.payload as { plannedPct?: number; completedPct?: number } | undefined
                  const pct = key === 'Planned Minutes' ? point?.plannedPct : point?.completedPct
                  return [`${Number(value ?? 0).toFixed(0)} min${pct !== undefined ? ` (${Number(pct).toFixed(1)}%)` : ''}`, key]
                }}
              />
              <Legend />
              <Bar dataKey="plannedMinutes" fill="#b8cce5" name="Planned Minutes" radius={[5, 5, 0, 0]} />
              <Bar dataKey="completedMinutes" fill="#1f6fd6" name="Completed Minutes" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className={styles.polarizationSummary}>
            <div className={styles.polarizationRow}>
              <span className={styles.polarizationLabel}>Planned L/M/H</span>
              <strong>{intensityDistribution.plannedLowPct.toFixed(1)}% / {intensityDistribution.plannedMidPct.toFixed(1)}% / {intensityDistribution.plannedHighPct.toFixed(1)}%</strong>
            </div>
            <div className={styles.polarizationRow}>
              <span className={styles.polarizationLabel}>Completed L/M/H</span>
              <strong>{intensityDistribution.completedLowPct.toFixed(1)}% / {intensityDistribution.completedMidPct.toFixed(1)}% / {intensityDistribution.completedHighPct.toFixed(1)}%</strong>
            </div>
            <div className={styles.polarizationRow}>
              <span className={styles.polarizationLabel}>Polarization Status</span>
              <span className={`${styles.polarizationStatusPill} ${styles[`polarizationStatusPill_${intensityDistribution.status}`] || ''}`}>
                {intensityDistribution.status === 'aligned'
                  ? 'Aligned'
                  : intensityDistribution.status === 'drifted'
                  ? 'Drifted'
                  : 'Insufficient Data'}
              </span>
            </div>
            <ul className={styles.polarizationInsightsList}>
              {intensityDistribution.insights.map((insight, index) => (
                <li key={`insight-${index}`}>{insight}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitleRow}>
            <h3>Plan Phase Focus (Week by Week)</h3>
            <div className={styles.chartTitleActions}>
              <span className={styles.helpIcon} tabIndex={0} data-tooltip="Shows what each week is designed to develop and which training block it belongs to.">?</span>
              <span className={styles.sourcePillPlanned}>Plan Data</span>
            </div>
          </div>
          <div className={styles.phaseWeekGrid}>
            {plan.weeks.map((week) => (
              <div key={`phase-week-${week.weekNumber}`} className={`${styles.phaseWeekCard} ${styles[`phaseWeekCard_${week.phase}`] || ''}`}>
                <div className={styles.phaseWeekHeader}>
                  <span className={styles.phaseWeekNum}>W{week.weekNumber}</span>
                  <span className={`${styles.phaseWeekBadge} ${styles[`phaseWeekBadge_${week.phase}`] || ''}`}>{week.phase}</span>
                  <span className={styles.phaseWeekHours}>{week.totalHours.toFixed(1)}h</span>
                </div>
                {week.focusPoints.length > 0 && (
                  <ul className={styles.phaseWeekFocus}>
                    {week.focusPoints.slice(0, 2).map((point, index) => (
                      <li key={`focus-${week.weekNumber}-${index}`}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>}
      </section>

      <section id="analytics-assessment" className={styles.analyticsSection}>
        <div className={styles.sectionHeaderCollapsible}>
          <div className={styles.sectionHeaderMain}>
            <h3>Rider Assessment Snapshot</h3>
            <p>
              Automated interpretation of synced ride data to highlight strengths, focus areas, and a TrainingPeaks-style
              readiness view using a CTL/ATL/TSB proxy from ride stress.
            </p>
          </div>
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => toggleSection('assessment')}
            aria-expanded={openSections.assessment}
            aria-controls="analytics-assessment-content"
          >
            {openSections.assessment ? 'Hide' : 'Show'}
            <span className={styles.sectionToggleIcon}>{openSections.assessment ? '▾' : '▸'}</span>
          </button>
        </div>
        {openSections.assessment && <div id="analytics-assessment-content" className={styles.assessmentMetricsGrid}>
          {riderAssessment.metrics.map((metric) => (
            <article
              key={metric.label}
              className={`${styles.assessmentMetricCard} ${styles[`assessmentMetric_${metric.status}`] || ''}`}
            >
              <div className={styles.assessmentMetricHeader}>
                <span className={styles.assessmentMetricLabel}>{metric.label}</span>
                <span className={styles.assessmentMetricValue}>{metric.value}</span>
              </div>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>}
        {openSections.assessment && <div className={styles.assessmentGrid}>
          <article className={styles.assessmentCard}>
            <h4>What Is Going Well</h4>
            <ul>
              {riderAssessment.strengths.map((item, index) => (
                <li key={`strength-${index}`}>{item}</li>
              ))}
            </ul>
          </article>
          <article className={styles.assessmentCardAction}>
            <h4>Coach Actions This Week</h4>
            <ul className={styles.actionList}>
              {riderAssessment.actions.map((action, index) => (
                <li key={action.key || `action-${index}`}>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${selectedCoachActionKey === action.key ? styles.actionButtonActive : ''}`}
                    onClick={() => handleCoachActionClick(action.key)}
                    aria-pressed={selectedCoachActionKey === action.key}
                    title="Click to highlight related sessions in the calendar"
                  >
                    <strong>{action.title}</strong>
                    <span>{action.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.actionHint}>Click an action to highlight related sessions in the calendar. Click again to clear.</p>
          </article>
          <article className={styles.assessmentCardImprove}>
            <h4>What To Improve</h4>
            <ul>
              {riderAssessment.improvements.map((item, index) => (
                <li key={`improve-${index}`}>{item}</li>
              ))}
            </ul>
          </article>
        </div>}
      </section>

      {/* Stats Summary */}
      <section id="analytics-stats" className={styles.analyticsSection}>
        <div className={styles.sectionHeaderCollapsible}>
          <div className={styles.sectionHeaderMain}>
            <h3>Summary Stats</h3>
            <p>Quick comparison between synced ride signals and the active planned training block.</p>
          </div>
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => toggleSection('stats')}
            aria-expanded={openSections.stats}
            aria-controls="analytics-stats-content"
          >
            {openSections.stats ? 'Hide' : 'Show'}
            <span className={styles.sectionToggleIcon}>{openSections.stats ? '▾' : '▸'}</span>
          </button>
        </div>
      {openSections.stats && <div id="analytics-stats-content" className={styles.statsSections}>
        <div className={styles.statsGroup}>
          <h3>Execution Trend (Last 12 Sessions)</h3>
          <div className={styles.executionTrendCard}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={sessionExecutionSummary.trendRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="date" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => {
                    const metric = String(name)
                    if (metric === 'Execution Score') {
                      return [`${Number(value ?? 0).toFixed(1)}`, metric]
                    }
                    return [`${Number(value ?? 0).toFixed(1)} pts`, metric]
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="executionScore" stroke="#1f6fd6" strokeWidth={2.2} dot={false} name="Execution Score" />
                <Line type="monotone" dataKey="plannedStress" stroke="#99b7dd" strokeWidth={1.6} dot={false} name="Planned Stress" />
                <Line type="monotone" dataKey="completedStress" stroke="#ea7c0a" strokeWidth={1.8} dot={false} name="Completed Stress" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartTitleRow}>
              <h3>Weekly Stress Timeline (Plan vs Done)</h3>
              <div className={styles.chartTitleActions}>
                <span className={styles.helpIcon} tabIndex={0} data-tooltip="TrainingPeaks-style weekly stress tracking. Compare planned stress against executed stress and completion trend.">?</span>
                <span className={styles.sourcePill}>Plan + Synced Data</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={weeklyStressTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="label" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis yAxisId="left" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => {
                    const metric = String(name)
                    if (metric === 'Completion %') {
                      return [`${Number(value ?? 0).toFixed(1)}%`, metric]
                    }
                    return [`${Number(value ?? 0).toFixed(1)} pts`, metric]
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="plannedStress" fill="#c4d8ef" name="Planned Stress" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="completedStress" fill="#1f6fd6" name="Completed Stress" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="completionPct" type="monotone" stroke="#ea7c0a" strokeWidth={2.2} dot={false} name="Completion %" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Session Type Execution</h3>
          <div className={styles.sessionTypeGrid}>
            {sessionTypeExecution.map((item) => (
              <article key={item.type} className={`${styles.sessionTypeCard} ${styles[`sessionTypeCard_${item.status}`] || ''}`}>
                <h4>{item.label}</h4>
                <p>
                  Execution: <strong>{item.executionPct.toFixed(1)}%</strong>
                </p>
                <p>
                  Stress: <strong>{item.completedStress.toFixed(1)}</strong> / {item.plannedStress.toFixed(1)}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Weekly Planning Assistant</h3>
          <article className={styles.planningAssistantCard}>
            <p className={styles.planningAssistantHeadline}>{weeklyPlanSuggestion.headline}</p>
            <ul className={styles.planningSlotList}>
              {weeklyPlanSuggestion.slots.filter((slot) => slot.durationMin > 0).map((slot, index) => (
                <li key={`slot-${index}`} className={styles.planningSlot}>
                  <span className={styles.planningSlotDay}>{slot.dayLabel}</span>
                  <span className={styles.planningSlotType}>{slot.sessionType}</span>
                  <span className={styles.planningSlotDuration}>{slot.durationMin} min</span>
                  <span className={styles.planningSlotRationale}>{slot.rationale}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className={styles.statsGroup}>
          <h3>Season Phase Overview</h3>
          <div className={styles.seasonChart}>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={seasonPhaseOverview}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                <XAxis dataKey="weekLabel" stroke="#60748a" tick={{ fill: '#60748a', fontSize: 10 }} interval={Math.max(0, Math.floor(seasonPhaseOverview.length / 12) - 1)} />
                <YAxis yAxisId="left" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#60748a" tick={{ fill: '#60748a' }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  formatter={(value, name) => {
                    const label = String(name)
                    if (label === 'Hours') return [`${Number(value ?? 0).toFixed(1)} h`, label]
                    return [`${Math.round(Number(value ?? 0))} pts`, label]
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="totalHours" name="Hours" radius={[3, 3, 0, 0]}
                  fill="#1f6fd6"
                  label={false}
                />
                <Line yAxisId="right" type="monotone" dataKey="intensityScore" stroke="#ea7c0a" strokeWidth={1.8} dot={false} name="Intensity" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.phaseLegend}>
            {(['base', 'build', 'peak', 'recovery'] as const).map((phase) => (
              <span key={phase} className={`${styles.phaseLegendPill} ${styles[`phaseLegendPill_${phase}`] || ''}`}>{phase}</span>
            ))}
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Training Monotony</h3>
          <article className={`${styles.monotonyCard} ${styles[`monotonyCard_${monotonyIndex.status}`] || ''}`}>
            <div className={styles.monotonyRow}>
              <span>Monotony Index (14d)</span>
              <strong className={styles[`monotonyValue_${monotonyIndex.status}`] || ''}>{monotonyIndex.score.toFixed(2)}</strong>
            </div>
            <div className={styles.monotonyRow}>
              <span>Strain Index</span>
              <strong>{monotonyIndex.strain.toFixed(0)}</strong>
            </div>
            <p className={styles.monotonyGuidance}>{monotonyIndex.guidance}</p>
          </article>
        </div>

        <div className={styles.statsGroup}>
          <h3>Readiness Zones (Last 28 Days)</h3>
          <div className={styles.readinessSummaryCard}>
            <div className={styles.readinessStatRow}>
              <span>Fresh Days (TSB {'>='} +5)</span>
              <strong>{readinessZones.freshDays}</strong>
            </div>
            <div className={styles.readinessStatRow}>
              <span>Balanced Days (-10 to +5)</span>
              <strong>{readinessZones.balancedDays}</strong>
            </div>
            <div className={styles.readinessStatRow}>
              <span>Heavy Days (TSB {'<='} -10)</span>
              <strong>{readinessZones.heavyDays}</strong>
            </div>
            <p className={styles.readinessMeta}>
              Total tracked days: <strong>{readinessZones.totalDays}</strong>
            </p>
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Weekly Load Ramp</h3>
          <article className={`${styles.rampGuidanceCard} ${styles[`rampGuidanceCard_${rampGuidance.status}`] || ''}`}>
            <div className={styles.rampGuidanceRow}>
              <span>This week</span>
              <strong>{rampGuidance.currentWeeklyLoad.toFixed(1)} pts</strong>
            </div>
            <div className={styles.rampGuidanceRow}>
              <span>Recommended band</span>
              <strong>{rampGuidance.recommendedMin.toFixed(0)} – {rampGuidance.recommendedMax.toFixed(0)} pts</strong>
            </div>
            <p className={styles.rampGuidanceText}>{rampGuidance.guidance}</p>
          </article>
          {rampTimeline.length > 0 && (
            <div className={styles.rampChart}>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={rampTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9eef5" />
                  <XAxis dataKey="label" stroke="#60748a" tick={{ fill: '#60748a' }} />
                  <YAxis stroke="#60748a" tick={{ fill: '#60748a' }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)} pts`, String(name)]}
                  />
                  <Legend />
                  <Bar dataKey="weeklyLoad" fill="#1f6fd6" name="Weekly Load" radius={[4, 4, 0, 0]} />
                  <Line dataKey="ramp" type="monotone" stroke="#ea7c0a" strokeWidth={2} dot={false} name="Ramp" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={styles.statsGroup}>
          <h3>Workout Execution Score (Recent Sessions)</h3>
          <div className={styles.executionSummaryRow}>
            <div className={styles.executionSummaryLabel}>7-day Average Score</div>
            <div className={`${styles.executionSummaryValue} ${sessionExecutionSummary.weeklyAvgScore >= 85 ? styles.executionSummaryValueGood : sessionExecutionSummary.weeklyAvgScore >= 65 ? styles.executionSummaryValueWatch : styles.executionSummaryValueRisk}`}>
              {sessionExecutionSummary.weeklyAvgScore.toFixed(1)}
            </div>
          </div>
          <div className={styles.executionList}>
            {sessionExecutionSummary.recentRows.map((row) => (
              <article key={row.sessionId} className={`${styles.executionCard} ${styles[`executionCard_${row.status}`] || ''}`}>
                <header>
                  <h4>{row.sessionType}</h4>
                  <span>{row.date}</span>
                </header>
                <p>
                  Score: <strong>{row.executionScore.toFixed(1)}</strong>
                </p>
                <p>
                  Stress: <strong>{row.completedStress.toFixed(1)}</strong> / {row.plannedStress.toFixed(1)}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Taper Advisor</h3>
          <article className={`${styles.taperCard} ${styles[`taperCard_${taperAdvisor.status}`] || ''}`}>
            <h4>{taperAdvisor.headline}</h4>
            <p>{taperAdvisor.detail}</p>
            <p className={styles.taperMeta}>
              Plan end in approximately <strong>{weeksToPlanEnd}</strong> week{weeksToPlanEnd === 1 ? '' : 's'}.
            </p>
          </article>
        </div>

        {racePrepStatuses.length > 0 && (
          <div className={styles.statsGroup}>
            <h3>Race Prep</h3>
            <div className={styles.racePrepList}>
              {racePrepStatuses.map((event) => (
                <article key={event.eventId} className={`${styles.racePrepCard} ${styles[`racePrepCard_${event.taperStage}`] || ''}`}>
                  <header className={styles.racePrepHeader}>
                    <div className={styles.racePrepTitleRow}>
                      <span className={`${styles.racePrepPriorityPill} ${styles[`racePrepPriority_${event.priority}`] || ''}`}>{event.priority}</span>
                      <h4>{event.eventName}</h4>
                    </div>
                    <div className={styles.racePrepMeta}>
                      <span className={`${styles.racePrepStagePill} ${styles[`racePrepStage_${event.taperStage}`] || ''}`}>
                        {event.taperStage === 'heavy_training' ? 'Build' :
                         event.taperStage === 'sharpening' ? 'Sharpening' :
                         event.taperStage === 'race_week' ? 'Race Week' :
                         event.taperStage === 'event_day' ? 'Event Day' : 'Past'}
                      </span>
                      <span className={styles.racePrepCountdown}>
                        {event.daysToEvent > 0 ? `${event.daysToEvent}d to go` : event.daysToEvent === 0 ? 'Today!' : `${Math.abs(event.daysToEvent)}d ago`}
                      </span>
                    </div>
                  </header>

                  <div className={styles.racePrepCompliance}>
                    <span>Key sessions (4w window)</span>
                    <div className={styles.racePrepProgressBar}>
                      <div
                        className={styles.racePrepProgressFill}
                        style={{ width: `${Math.min(100, event.windowCompliance.completionPct)}%` }}
                      />
                    </div>
                    <strong>{event.windowCompliance.completedKeySessions}/{event.windowCompliance.plannedKeySessions} ({event.windowCompliance.completionPct.toFixed(0)}%)</strong>
                  </div>

                  <ul className={styles.racePrepChecklist}>
                    {event.checklist.map((item, idx) => (
                      <li key={`${event.eventId}-check-${idx}`} className={`${styles.racePrepCheckItem} ${styles[`racePrepCheckItem_${item.status}`] || ''}`}>
                        <span className={styles.racePrepCheckIcon}>
                          {item.status === 'done' ? '✓' : item.status === 'na' ? '—' : '○'}
                        </span>
                        {item.label}
                      </li>
                    ))}
                  </ul>

                  {event.projectedTsb !== undefined && (
                    <p className={styles.racePrepTsb}>
                      Projected form (TSB): <strong>{event.projectedTsb.toFixed(1)}</strong>
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {eventReadiness.length > 0 && (
          <div className={styles.statsGroup}>
            <h3>Event Readiness Projection</h3>
            <div className={styles.eventReadinessList}>
              {eventReadiness.map((event) => (
                <article key={event.id} className={`${styles.eventReadinessCard} ${styles[`eventReadinessCard_${event.status}`] || ''}`}>
                  <header>
                    <h4>{event.priority} Priority</h4>
                    <span>{event.date}</span>
                  </header>
                  <p className={styles.eventName}>{event.name}</p>
                  <p>
                    Projected TSB:{' '}
                    <strong>{event.tsb !== undefined ? event.tsb.toFixed(1) : 'Not in modeled horizon'}</strong>
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className={styles.statsGroup}>
          <h3>Compliance (Recent Weeks)</h3>
          <div className={styles.complianceList}>
            {weeklyCompliance.map((week) => (
              <article
                key={`compliance-${week.weekNumber}`}
                className={`${styles.complianceCard} ${styles[`complianceCard_${week.status}`] || ''}`}
              >
                <header>
                  <h4>Week {week.weekNumber}</h4>
                  <span>{week.completedSessions}/{week.plannedSessions} sessions</span>
                </header>
                <div className={styles.complianceBadgeRow}>
                  <span
                    className={`${styles.complianceBadge} ${styles[`complianceBadge_${week.status}`] || ''}`}
                    title={week.statusReasons.join(' | ')}
                    aria-label={`Week ${week.weekNumber} status details: ${week.statusReasons.join('. ')}`}
                    tabIndex={0}
                  >
                    {week.status === 'good' ? 'On Track' : week.status === 'watch' ? 'Needs Attention' : 'At Risk'}
                  </span>
                </div>
                <p>
                  Completion: <strong>{week.completionPct.toFixed(1)}%</strong>
                </p>
                <p>
                  Key Session Hit Rate: <strong>{week.keySessionHitRate.toFixed(1)}%</strong>
                </p>
                <p>
                  Stress Delta: <strong>{week.stressDeltaPct.toFixed(1)}%</strong> ({week.completedStress.toFixed(1)} / {week.plannedStress.toFixed(1)})
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Actual (Synced Rides)</h3>
          <div className={styles.statsSummary}>
            <div className={styles.statBox}>
              <div className={styles.label}>Recent Rides</div>
              <div className={styles.value}>{intervalsRideData.length}</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.label}>Avg Power</div>
              <div className={styles.value}>{avgPowerFromRides > 0 ? `${avgPowerFromRides} W` : '—'}</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.label}>FTP (From Rides)</div>
              <div className={styles.value}>{ftpFromRides > 0 ? `${ftpFromRides} W` : '—'}</div>
            </div>
          </div>
        </div>

        <div className={styles.statsGroup}>
          <h3>Planned (Current Plan)</h3>
          <div className={`${styles.statsSummary} ${styles.statsSummaryCompact}`}>
            <div className={styles.statBox}>
              <div className={styles.label}>Total Training Hours</div>
              <div className={styles.value}>{Math.round(plan.weeks.reduce((sum, w) => sum + w.totalHours, 0))} h</div>
            </div>
            <div className={styles.statBox}>
              <div className={styles.label}>FTP Target</div>
              <div className={styles.value}>{effectiveFtpTarget > 0 ? `${effectiveFtpTarget} W` : '—'}</div>
            </div>
          </div>
        </div>
      </div>}
      </section>
    </div>
  )
}
