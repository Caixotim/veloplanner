import type { DetectedChange, SyncResult, TrainingPlan, UserProfile } from './types'
import { storage } from './storage'
import { buildIntervalsCredentialHeaders, getIntervalsCredentials } from './integrationCredentials'
import { hydrateTrainingPlanDates } from './planDateHydration'


type IntervalRide = {
  id: string
  date: number
  maxPower: number
  peakPower?: number
  normalizedPower?: number
  averagePower?: number
  ftpWatts?: number
  trainingLoad?: number
  intensity?: number
  trimp?: number
  powerZoneTimes?: Record<string, number>
  hrZoneTimes?: number[]
  powerZoneTotalSecs?: number
  easyPowerZoneSecs?: number
  highPowerZoneSecs?: number
  sweetSpotZoneSecs?: number
  avgHR: number
  maxHR?: number
  duration: number
  distance: number
}

type IntervalsRidesResponse = {
  success: boolean
  rides: IntervalRide[]
  newRidesCount: number
  changes: Array<{ type: string; label: string }>
  error?: string
}

type CachedRideMetrics = {
  trainingLoad?: number
  intensity?: number
  trimp?: number
  normalizedPower?: number
  averagePower?: number
  maxPower?: number
  bestEffort15s?: number
  bestEffort1m?: number
  bestEffort5m?: number
  bestEffort20m?: number
  bestEffort60m?: number
  ftpWatts?: number
  powerZoneTotalSecs?: number
  easyPowerZoneSecs?: number
  highPowerZoneSecs?: number
  sweetSpotZoneSecs?: number
  elevationGainM?: number
  avgHR?: number
  duration?: number
  rideDate?: number
}

type EventsBlockedDatesResponse = {
  success: boolean
  blockedDates: string[]
  error?: string
}

export type IntervalsTrainingInsights = {
  hasRecentData: boolean
  acuteLoad: number
  chronicLoad: number
  loadRatio: number
  avgIntensity: number
  highIntensityShare: number
  easyPowerZoneShare: number
  highPowerZoneShare: number
  sweetSpotZoneShare: number
  avgTrimp: number
  athleteSignature?: AthleteRideSignature
}

export type AthleteRideSignature = {
  sustainedPowerFraction: number
  aerobicEfficiencyScore: number
  fatigueResistanceScore: number
  highIntensityDensityScore: number
  enduranceDecouplingScore: number
  powerDurationProfile: {
    shortPowerFraction: number
    vo2PowerFraction: number
    thresholdPowerFraction: number
    longEndurancePowerFraction: number
  }
  climbingProfile: {
    sustainedUphillPowerFraction: number
    climbingTrendScore: number
    climbingWattsPerKg?: number
  }
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

function getQuantile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * quantile
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex]
  }

  const weight = index - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

function buildAthleteRideSignature(rides: CachedRideMetrics[], athleteWeightKg?: number): AthleteRideSignature | undefined {
  if (rides.length === 0) {
    return undefined
  }

  const ftpCandidates = rides.map((ride) => ride.ftpWatts || 0).filter((value) => value > 0)
  const normalizedCandidates = rides.map((ride) => ride.normalizedPower || 0).filter((value) => value > 0)
  const derivedFtp =
    ftpCandidates.length > 0
      ? getQuantile(ftpCandidates, 0.5)
      : normalizedCandidates.length > 0
      ? Math.max(...normalizedCandidates) * 0.95
      : 0

  if (derivedFtp <= 0) {
    return undefined
  }

  const sustainedPowerFractions = rides
    .filter((ride) => (ride.duration || 0) >= 40 && (ride.normalizedPower || 0) > 0)
    .map((ride) => (ride.normalizedPower || 0) / derivedFtp)

  const aerobicEfficiencyValues = rides
    .filter((ride) => (ride.duration || 0) >= 60 && (ride.avgHR || 0) > 0 && ((ride.averagePower || 0) > 0 || (ride.normalizedPower || 0) > 0))
    .map((ride) => (ride.averagePower || ride.normalizedPower || 0) / Math.max(1, ride.avgHR || 1))

  const fatigueResistanceValues = rides
    .filter((ride) => (ride.duration || 0) >= 90 && (ride.averagePower || 0) > 0 && (ride.normalizedPower || 0) > 0)
    .map((ride) => (ride.averagePower || 0) / Math.max(1, ride.normalizedPower || 1))

  const highIntensityDensityValues = rides
    .filter((ride) => (ride.powerZoneTotalSecs || 0) > 0)
    .map((ride) => (ride.highPowerZoneSecs || 0) / Math.max(1, ride.powerZoneTotalSecs || 1))

  const shortPowerFractions = rides
    .filter((ride) => (ride.bestEffort15s || ride.maxPower || 0) > 0)
    .map((ride) => (ride.bestEffort15s || ride.maxPower || 0) / derivedFtp)

  const directVo2PowerFractions = rides
    .filter((ride) => (ride.bestEffort5m || 0) > 0)
    .map((ride) => (ride.bestEffort5m || 0) / derivedFtp)

  const estimatedVo2PowerFractions = rides
    .filter((ride) => (ride.duration || 0) >= 8 && (ride.duration || 0) <= 30 && (ride.normalizedPower || 0) > 0)
    .map((ride) => (ride.normalizedPower || 0) / derivedFtp)

  const vo2PowerFractions = directVo2PowerFractions.length > 0 ? directVo2PowerFractions : estimatedVo2PowerFractions

  const directThresholdPowerFractions = rides
    .filter((ride) => (ride.bestEffort20m || 0) > 0)
    .map((ride) => (ride.bestEffort20m || 0) / derivedFtp)

  const estimatedThresholdPowerFractions = rides
    .filter((ride) => (ride.duration || 0) >= 20 && (ride.duration || 0) <= 70 && (ride.normalizedPower || 0) > 0)
    .map((ride) => (ride.normalizedPower || 0) / derivedFtp)

  const thresholdPowerFractions =
    directThresholdPowerFractions.length > 0 ? directThresholdPowerFractions : estimatedThresholdPowerFractions

  const directLongPowerFractions = rides
    .filter((ride) => (ride.bestEffort60m || 0) > 0)
    .map((ride) => (ride.bestEffort60m || 0) / derivedFtp)

  const estimatedLongEndurancePowerFractions = rides
    .filter((ride) => (ride.duration || 0) >= 120 && ((ride.averagePower || 0) > 0 || (ride.normalizedPower || 0) > 0))
    .map((ride) => (ride.averagePower || ride.normalizedPower || 0) / derivedFtp)

  const longEndurancePowerFractions =
    directLongPowerFractions.length > 0 ? directLongPowerFractions : estimatedLongEndurancePowerFractions

  const baselineEnduranceEfficiency = rides
    .filter((ride) => (ride.duration || 0) >= 45 && (ride.duration || 0) <= 90 && (ride.avgHR || 0) > 0 && (ride.averagePower || 0) > 0)
    .map((ride) => (ride.averagePower || 0) / Math.max(1, ride.avgHR || 1))

  const longRideEfficiency = rides
    .filter((ride) => (ride.duration || 0) >= 120 && (ride.avgHR || 0) > 0 && (ride.averagePower || 0) > 0)
    .map((ride) => (ride.averagePower || 0) / Math.max(1, ride.avgHR || 1))

  const baselineEfficiency = getQuantile(baselineEnduranceEfficiency, 0.5) || 1.5
  const longEfficiency = getQuantile(longRideEfficiency, 0.5) || baselineEfficiency
  const enduranceDecouplingScore = clamp(0.75, 1.05, longEfficiency / Math.max(1, baselineEfficiency))

  const climbRides = rides
    .filter((ride) => {
      const durationMinutes = ride.duration || 0
      const elevationGainM = ride.elevationGainM || 0
      const ascentRate = durationMinutes > 0 ? (elevationGainM * 60) / durationMinutes : 0
      return durationMinutes >= 40 && (elevationGainM >= 350 || ascentRate >= 500)
    })
    .sort((left, right) => (left.rideDate || 0) - (right.rideDate || 0))

  const climbPowerFractions = climbRides
    .filter((ride) => (ride.normalizedPower || 0) > 0)
    .map((ride) => (ride.normalizedPower || 0) / derivedFtp)

  const climbSustainedPowerFraction = clamp(0.7, 1.15, getQuantile(climbPowerFractions, 0.7) || getQuantile(sustainedPowerFractions, 0.7) || 0.9)
  const climbPowerPerKg =
    athleteWeightKg && athleteWeightKg > 0
      ? getQuantile(
          climbRides
            .filter((ride) => (ride.normalizedPower || 0) > 0)
            .map((ride) => (ride.normalizedPower || 0) / athleteWeightKg),
          0.6
        ) || undefined
      : undefined

  let climbingTrendScore = 1
  if (climbRides.length >= 6) {
    const midpoint = Math.floor(climbRides.length / 2)
    const earlyClimb = climbRides.slice(0, midpoint)
    const lateClimb = climbRides.slice(midpoint)
    const earlyPower = getQuantile(
      earlyClimb
        .filter((ride) => (ride.normalizedPower || 0) > 0)
        .map((ride) => (ride.normalizedPower || 0) / derivedFtp),
      0.6
    )
    const latePower = getQuantile(
      lateClimb
        .filter((ride) => (ride.normalizedPower || 0) > 0)
        .map((ride) => (ride.normalizedPower || 0) / derivedFtp),
      0.6
    )

    if (earlyPower > 0 && latePower > 0) {
      climbingTrendScore = clamp(0.85, 1.2, latePower / earlyPower)
    }
  }

  return {
    sustainedPowerFraction: clamp(0.65, 1.1, getQuantile(sustainedPowerFractions, 0.75) || 0.88),
    aerobicEfficiencyScore: clamp(0.75, 1.2, (getQuantile(aerobicEfficiencyValues, 0.5) || 1.5) / 1.5),
    fatigueResistanceScore: clamp(0.7, 1, getQuantile(fatigueResistanceValues, 0.5) || 0.82),
    highIntensityDensityScore: clamp(0.6, 1.2, (getQuantile(highIntensityDensityValues, 0.75) || 0.12) / 0.12),
    enduranceDecouplingScore,
    powerDurationProfile: {
      shortPowerFraction: clamp(1.1, 2.5, getQuantile(shortPowerFractions, 0.9) || 1.5),
      vo2PowerFraction: clamp(0.9, 1.25, getQuantile(vo2PowerFractions, 0.75) || 1.05),
      thresholdPowerFraction: clamp(0.8, 1.08, getQuantile(thresholdPowerFractions, 0.75) || 0.95),
      longEndurancePowerFraction: clamp(0.5, 0.9, getQuantile(longEndurancePowerFractions, 0.6) || 0.68),
    },
    climbingProfile: {
      sustainedUphillPowerFraction: climbSustainedPowerFraction,
      climbingTrendScore,
      climbingWattsPerKg: climbPowerPerKg ? Number(climbPowerPerKg.toFixed(2)) : undefined,
    },
  }
}

function detectProfileChanges(beforeProfile: UserProfile, afterProfile: UserProfile): DetectedChange[] {
  const changes: DetectedChange[] = []

  if (beforeProfile.ftp && afterProfile.ftp) {
    const ftpDiff = afterProfile.ftp - beforeProfile.ftp
    if (ftpDiff > 5) {
      changes.push({
        type: 'ftp_increase',
        label: `FTP Increased: ${beforeProfile.ftp}w -> ${afterProfile.ftp}w`,
        before: beforeProfile.ftp,
        after: afterProfile.ftp,
        confidence: 0.85,
      })
    } else if (ftpDiff < -5) {
      changes.push({
        type: 'ftp_decrease',
        label: `FTP Decreased: ${beforeProfile.ftp}w -> ${afterProfile.ftp}w`,
        before: beforeProfile.ftp,
        after: afterProfile.ftp,
        confidence: 0.8,
      })
    }
  }

  if (beforeProfile.maxHeartRate && afterProfile.maxHeartRate) {
    const hrDiff = afterProfile.maxHeartRate - beforeProfile.maxHeartRate
    if (hrDiff < -5) {
      changes.push({
        type: 'fatigue',
        label: `Potential Fatigue: Max HR decreased by ${Math.abs(hrDiff)}bpm`,
        before: beforeProfile.maxHeartRate,
        after: afterProfile.maxHeartRate,
        confidence: 0.6,
      })
    }
  }

  return changes
}

/**
 * Delta-sync rides from Intervals.icu via server-side API route and update profile estimates.
 * @param _accessToken - Not used (auth handled server-side)
 * @param userProfile - Current user profile for comparison
 * @param forceRefresh - Skip cache and force full fetch (used for manual syncs)
 */
export async function syncIntervalsDelta(_accessToken: string, userProfile: UserProfile, forceRefresh = false): Promise<SyncResult> {
  const startTime = Date.now()

  try {
    const credentials = await getIntervalsCredentials()
    if (!credentials) {
      throw new Error('Intervals connection missing. Connect Intervals.icu and save API credentials first.')
    }

    const syncMeta = await storage.getSyncMetadata()

    const hourAgo = Date.now() - 60 * 60 * 1000
    const isSyncStale = syncMeta.lastSyncTime < hourAgo

    if (!forceRefresh && !isSyncStale && syncMeta.lastSyncStatus === 'success') {
      return {
        success: true,
        timestamp: startTime,
        newRidesCount: 0,
        changes: [],
        beforeProfile: userProfile,
        afterProfile: userProfile,
      }
    }

    await storage.updateSyncMetadata({ lastSyncStatus: 'pending' })

    const response = await fetch('/api/intervals/rides', {
      method: 'POST',
      headers: await buildIntervalsCredentialHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ since: syncMeta.lastSyncTime, forceRefresh }),
    })

    if (!response.ok) {
      throw new Error(`Intervals rides sync request failed (${response.status})`)
    }

    const ridesResult = (await response.json()) as IntervalsRidesResponse

    if (!ridesResult.success) {
      throw new Error(ridesResult.error || 'Intervals rides sync failed')
    }

    const rides = ridesResult.rides || []

    if (rides.length === 0) {
      // On 0 results, reset lastSyncTime to 0 to ensure next sync tries full 90-day lookback.
      // This prevents getting stuck in a "no new rides" loop when forceRefresh or initial sync.
      await storage.updateSyncMetadata({
        lastSyncStatus: 'success',
        lastSyncTime: forceRefresh ? 0 : syncMeta.lastSyncTime,
      })

      return {
        success: true,
        timestamp: startTime,
        newRidesCount: 0,
        changes: [],
        beforeProfile: userProfile,
        afterProfile: userProfile,
      }
    }

    // Store the newest ride timestamp for next delta sync
    // This ensures next sync fetches only rides after the most recent one we just retrieved
    const newestRideTime = Math.max(...rides.map((r) => r.date))

    for (const ride of rides) {
      await storage.cacheRide(`ride-${ride.id}`, {
        ...ride,
        rideDate: ride.date,
      })
    }

    const ftpCandidates = rides.map((ride) => ride.ftpWatts || 0).filter((value) => value > 0)
    const normalizedPowerCandidates = rides.map((ride) => ride.normalizedPower || 0).filter((value) => value > 0)
    const averagePowerCandidates = rides.map((ride) => ride.averagePower || 0).filter((value) => value > 0)

    let estimatedFTP = userProfile.ftp
    if (ftpCandidates.length > 0) {
      estimatedFTP = Math.round(ftpCandidates.reduce((sum, value) => sum + value, 0) / ftpCandidates.length)
    } else if (normalizedPowerCandidates.length > 0) {
      const highestNormalizedPower = Math.max(...normalizedPowerCandidates)
      estimatedFTP = Math.round(highestNormalizedPower * 0.95)
    } else if (averagePowerCandidates.length > 0) {
      const highestAveragePower = Math.max(...averagePowerCandidates)
      estimatedFTP = Math.round(highestAveragePower * 1.1)
    }

    const ridesWithHR = rides.filter((ride) => typeof ride.maxHR === 'number' && ride.maxHR > 0)
    const avgMaxHR =
      ridesWithHR.length > 0
        ? Math.round(ridesWithHR.reduce((sum, ride) => sum + (ride.maxHR || 0), 0) / ridesWithHR.length)
        : userProfile.maxHeartRate || 180

    const updatedProfile: UserProfile = {
      ...userProfile,
      ftp: estimatedFTP,
      maxHeartRate: avgMaxHR,
      updatedAt: new Date(),
    }

    const detectedChanges = detectProfileChanges(userProfile, updatedProfile)

    await storage.updateSyncMetadata({
      lastSyncStatus: 'success',
      lastSyncTime: newestRideTime,
      totalRidesSynced: (syncMeta.totalRidesSynced || 0) + rides.length,
    })

    console.info('Synced Intervals rides', {
      ridesCount: rides.length,
      estimatedFTP,
      avgTrainingLoad:
        rides.length > 0
          ? Math.round(rides.reduce((sum, ride) => sum + (ride.trainingLoad || 0), 0) / rides.length)
          : 0,
      changes: detectedChanges.length,
    })

    return {
      success: true,
      timestamp: startTime,
      newRidesCount: rides.length,
      changes: detectedChanges,
      beforeProfile: userProfile,
      afterProfile: updatedProfile,
    }
  } catch (error) {
    console.error('Intervals delta sync failed', { error })

    await storage.updateSyncMetadata({
      lastSyncStatus: 'error',
      lastError: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      success: false,
      timestamp: startTime,
      newRidesCount: 0,
      changes: [],
      beforeProfile: userProfile,
      afterProfile: userProfile,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function isIntervalsSyncNeeded(): Promise<boolean> {
  const syncMeta = await storage.getSyncMetadata()
  const oneHourAgo = Date.now() - 60 * 60 * 1000

  return syncMeta.lastSyncTime < oneHourAgo || syncMeta.lastSyncStatus === 'error'
}

export async function getIntervalsTrainingInsights(athleteWeightKg?: number): Promise<IntervalsTrainingInsights> {
  const now = Date.now()
  const threeWeeksAgo = now - 21 * 24 * 60 * 60 * 1000
  const twelveWeeksAgo = now - 84 * 24 * 60 * 60 * 1000

  const rides = (await storage.getCachedRides(twelveWeeksAgo)) as CachedRideMetrics[]
  if (rides.length === 0) {
    return {
      hasRecentData: false,
      acuteLoad: 0,
      chronicLoad: 0,
      loadRatio: 0,
      avgIntensity: 0,
      highIntensityShare: 0,
      easyPowerZoneShare: 0,
      highPowerZoneShare: 0,
      sweetSpotZoneShare: 0,
      avgTrimp: 0,
      athleteSignature: undefined,
    }
  }

  const recentRides = rides.filter((ride) => typeof ride.rideDate === 'number' && ride.rideDate >= threeWeeksAgo)
  const ridesWithLoad = rides.filter((ride) => typeof ride.trainingLoad === 'number' && ride.trainingLoad > 0)
  const ridesWithIntensity = rides.filter((ride) => typeof ride.intensity === 'number' && ride.intensity > 0)
  const ridesWithTrimp = rides.filter((ride) => typeof ride.trimp === 'number' && ride.trimp > 0)

  const acuteLoad = recentRides.reduce((sum, ride) => sum + (ride.trainingLoad || 0), 0)
  const chronicLoad = rides.reduce((sum, ride) => sum + (ride.trainingLoad || 0), 0)
  const chronicWeeklyLoad = chronicLoad / 4
  const loadRatio = chronicWeeklyLoad > 0 ? acuteLoad / chronicWeeklyLoad : 0

  const avgIntensity =
    ridesWithIntensity.length > 0
      ? ridesWithIntensity.reduce((sum, ride) => sum + (ride.intensity || 0), 0) / ridesWithIntensity.length
      : 0

  const highIntensityRides = rides.filter((ride) => {
    if ((ride.intensity || 0) >= 75) {
      return true
    }

    if ((ride.normalizedPower || 0) > 0 && (ride.ftpWatts || 0) > 0) {
      const normalizedRatio = (ride.normalizedPower || 0) / (ride.ftpWatts || 1)
      return normalizedRatio >= 0.9
    }

    return false
  })
  const highIntensityShare = rides.length > 0 ? highIntensityRides.length / rides.length : 0

  const avgTrimp =
    ridesWithTrimp.length > 0 ? ridesWithTrimp.reduce((sum, ride) => sum + (ride.trimp || 0), 0) / ridesWithTrimp.length : 0

  const totalPowerZoneSecs = rides.reduce((sum, ride) => sum + (ride.powerZoneTotalSecs || 0), 0)
  const easyPowerZoneSecs = rides.reduce((sum, ride) => sum + (ride.easyPowerZoneSecs || 0), 0)
  const highPowerZoneSecs = rides.reduce((sum, ride) => sum + (ride.highPowerZoneSecs || 0), 0)
  const sweetSpotZoneSecs = rides.reduce((sum, ride) => sum + (ride.sweetSpotZoneSecs || 0), 0)

  const easyPowerZoneShare = totalPowerZoneSecs > 0 ? easyPowerZoneSecs / totalPowerZoneSecs : 0
  const highPowerZoneShare = totalPowerZoneSecs > 0 ? highPowerZoneSecs / totalPowerZoneSecs : 0
  const sweetSpotZoneShare = totalPowerZoneSecs > 0 ? sweetSpotZoneSecs / totalPowerZoneSecs : 0

  console.info('Computed Intervals training insights', {
    rides: rides.length,
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    loadRatio: Number(loadRatio.toFixed(2)),
    avgIntensity: Math.round(avgIntensity),
    highIntensityShare: Number(highIntensityShare.toFixed(2)),
    easyPowerZoneShare: Number(easyPowerZoneShare.toFixed(2)),
    highPowerZoneShare: Number(highPowerZoneShare.toFixed(2)),
    sweetSpotZoneShare: Number(sweetSpotZoneShare.toFixed(2)),
  })

  const athleteSignature = buildAthleteRideSignature(rides, athleteWeightKg)

  return {
    hasRecentData: ridesWithLoad.length > 0,
    acuteLoad,
    chronicLoad,
    loadRatio,
    avgIntensity,
    highIntensityShare,
    easyPowerZoneShare,
    highPowerZoneShare,
    sweetSpotZoneShare,
    avgTrimp,
    athleteSignature,
  }
}

export async function fetchIntervalsBlockedDates(oldest: string, newest: string): Promise<string[]> {
  try {
    const credentials = await getIntervalsCredentials()
    if (!credentials) {
      return []
    }

    const response = await fetch('/api/intervals/events', {
      method: 'POST',
      headers: await buildIntervalsCredentialHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ oldest, newest }),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch blocked event dates (${response.status})`)
    }

    const payload = (await response.json()) as EventsBlockedDatesResponse
    if (!payload.success) {
      return []
    }

    return payload.blockedDates || []
  } catch (error) {
    console.warn('Unable to fetch Intervals blocked dates', { error })
    return []
  }
}

/**
 * Fetch training plans that were previously synced to Intervals.icu
 * Returns reconstructed TrainingPlan objects from Intervals events
 */
export async function fetchPlansFromIntervals(): Promise<{ plans: TrainingPlan[]; success: boolean; error?: string }> {
  try {
    const credentials = await getIntervalsCredentials()
    if (!credentials) {
      return { plans: [], success: false, error: 'Intervals credentials missing' }
    }

    const response = await fetch('/api/intervals/plans/fetch', {
      method: 'POST',
      headers: await buildIntervalsCredentialHeaders({ 'Content-Type': 'application/json' }),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch plans (${response.status})`)
    }

    const result = (await response.json()) as {
      success: boolean
      plans?: unknown[]
      count?: number
      error?: string
    }

    if (result.success && result.plans && result.plans.length > 0) {
      const hydratedPlans = result.plans
        .map((rawPlan) => hydrateTrainingPlanDates(rawPlan))
        .filter((plan): plan is TrainingPlan => plan !== null)

      console.info(`Fetched ${result.count || 0} plan(s) from Intervals.icu`)
      return { plans: hydratedPlans, success: true }
    }

    return { plans: [], success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to fetch plans from Intervals.icu', { error: message })
    return { plans: [], success: false, error: message }
  }
}
