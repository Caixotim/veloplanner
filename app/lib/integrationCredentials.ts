import { storage } from './storage'
import { getDefaultTimezone, normalizeTimezone } from './timezone'

export type IntervalsCredentials = {
  apiKey: string
  athleteId: string
  updatedAt: number
}

const INTERVALS_CREDENTIALS_STORAGE_KEY = 'veloplanner_intervals_credentials_v1'

function readCredentialsFromLocalStorage(): IntervalsCredentials | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(INTERVALS_CREDENTIALS_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<IntervalsCredentials>
    if (!parsed.apiKey || !parsed.athleteId || typeof parsed.updatedAt !== 'number') {
      return null
    }

    return {
      apiKey: parsed.apiKey,
      athleteId: parsed.athleteId,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function writeCredentialsToLocalStorage(credentials: IntervalsCredentials): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(INTERVALS_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials))
}

function removeCredentialsFromLocalStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(INTERVALS_CREDENTIALS_STORAGE_KEY)
}

export async function getIntervalsCredentials(): Promise<IntervalsCredentials | null> {
  const localCredentials = readCredentialsFromLocalStorage()
  if (localCredentials) {
    return localCredentials
  }

  const credentials = await storage.getIntegrationCredentials('intervals')

  if (!credentials?.apiKey || !credentials.athleteId) {
    return null
  }

  const normalized = {
    apiKey: credentials.apiKey,
    athleteId: credentials.athleteId,
    updatedAt: credentials.updatedAt,
  }

  writeCredentialsToLocalStorage(normalized)
  return normalized
}

export async function saveIntervalsCredentials(credentials: Omit<IntervalsCredentials, 'updatedAt'>): Promise<void> {
  const normalized: IntervalsCredentials = {
    apiKey: credentials.apiKey.trim(),
    athleteId: credentials.athleteId.trim(),
    updatedAt: Date.now(),
  }

  writeCredentialsToLocalStorage(normalized)

  try {
    await storage.saveIntegrationCredentials('intervals', normalized)
  } catch (error) {
    console.warn('Intervals credentials saved locally but IndexedDB persistence failed', { error })
  }
}

export async function clearIntervalsCredentials(): Promise<void> {
  removeCredentialsFromLocalStorage()

  try {
    await storage.removeIntegrationCredentials('intervals')
  } catch (error) {
    console.warn('Intervals credentials cleared locally but IndexedDB cleanup failed', { error })
  }
}

export async function buildIntervalsCredentialHeaders(baseHeaders?: HeadersInit, timeZone?: string): Promise<HeadersInit> {
  const credentials = await getIntervalsCredentials()

  if (!credentials) {
    return baseHeaders || {}
  }

  const headers = new Headers(baseHeaders || {})
  headers.set('x-intervals-api-key', credentials.apiKey)
  headers.set('x-intervals-athlete-id', credentials.athleteId)
  headers.set('x-athlete-timezone', normalizeTimezone(timeZone || getDefaultTimezone()))
  return headers
}
