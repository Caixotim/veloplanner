type RidePoint = {
  date: number
  ftpWatts?: number
  normalizedPower?: number
}

export type ThresholdSnapshot = {
  date: string
  ftp: number
  versionLabel: string
}

export type ZoneVersion = {
  versionLabel: string
  ftp: number
  zones: Array<{
    name: string
    min: number
    max: number
  }>
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildZones(ftp: number): ZoneVersion['zones'] {
  const boundedFtp = Math.max(120, ftp)
  return [
    { name: 'Z1 Recovery', min: Math.round(boundedFtp * 0.5), max: Math.round(boundedFtp * 0.6) },
    { name: 'Z2 Endurance', min: Math.round(boundedFtp * 0.61), max: Math.round(boundedFtp * 0.75) },
    { name: 'Z3 Tempo', min: Math.round(boundedFtp * 0.76), max: Math.round(boundedFtp * 0.9) },
    { name: 'Z4 Threshold', min: Math.round(boundedFtp * 0.91), max: Math.round(boundedFtp * 1.05) },
    { name: 'Z5 VO2+', min: Math.round(boundedFtp * 1.06), max: Math.round(boundedFtp * 1.25) },
  ]
}

export function computeThresholdHistory(rides: RidePoint[], fallbackFtp?: number): ThresholdSnapshot[] {
  const sortedRides = rides
    .map((ride) => ({ ...ride, parsedDate: new Date(ride.date) }))
    .filter((ride) => !Number.isNaN(ride.parsedDate.getTime()))
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())

  const rawSnapshots: Array<{ date: string; ftp: number }> = []
  for (const ride of sortedRides) {
    const directFtp = ride.ftpWatts || 0
    const inferred = ride.normalizedPower ? Math.round(ride.normalizedPower * 0.95) : 0
    const ftp = directFtp > 0 ? directFtp : inferred
    if (ftp <= 0) {
      continue
    }

    rawSnapshots.push({
      date: formatDateKey(ride.parsedDate),
      ftp,
    })
  }

  if (rawSnapshots.length === 0 && fallbackFtp && fallbackFtp > 0) {
    return [
      {
        date: formatDateKey(new Date()),
        ftp: fallbackFtp,
        versionLabel: 'v1',
      },
    ]
  }

  const deduped: Array<{ date: string; ftp: number }> = []
  for (const snap of rawSnapshots) {
    const last = deduped[deduped.length - 1]
    if (!last || Math.abs(last.ftp - snap.ftp) >= 4) {
      deduped.push({
        date: snap.date,
        ftp: Math.round(snap.ftp),
      })
    }
  }

  return deduped.slice(-8).map((snapshot, index) => ({
    date: snapshot.date,
    ftp: snapshot.ftp,
    versionLabel: `v${index + 1}`,
  }))
}

export function computeZoneVersions(history: ThresholdSnapshot[]): ZoneVersion[] {
  return history.map((snapshot) => ({
    versionLabel: snapshot.versionLabel,
    ftp: snapshot.ftp,
    zones: buildZones(snapshot.ftp),
  }))
}

export function summarizeThresholdTrend(history: ThresholdSnapshot[]): {
  deltaWatts: number
  deltaPct: number
} {
  if (history.length < 2) {
    return { deltaWatts: 0, deltaPct: 0 }
  }

  const first = history[0]
  const latest = history[history.length - 1]
  const deltaWatts = latest.ftp - first.ftp
  const deltaPct = first.ftp > 0 ? clamp(-60, 60, (deltaWatts / first.ftp) * 100) : 0

  return {
    deltaWatts: roundToOne(deltaWatts),
    deltaPct: roundToOne(deltaPct),
  }
}