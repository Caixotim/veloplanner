import { formatDateInTimezone, normalizeTimezone } from '../../lib/timezone'


export type IntervalsConfig = {
  baseUrl: string
  athleteId: string
  apiKey: string
}

type IntervalsOverrides = Partial<IntervalsConfig>

export function getIntervalsConfig(overrides: IntervalsOverrides = {}): IntervalsConfig {
  return {
    baseUrl: overrides.baseUrl || process.env.NEXT_PUBLIC_INTERVALS_ICU_API_URL || 'https://intervals.icu',
    athleteId: overrides.athleteId || '',
    apiKey: overrides.apiKey || '',
  }
}

export function getIntervalsConfigFromRequest(request: Request, overrides: IntervalsOverrides = {}): IntervalsConfig {
  const apiKeyFromHeader = request.headers.get('x-intervals-api-key') || ''
  const athleteIdFromHeader = request.headers.get('x-intervals-athlete-id') || ''

  return getIntervalsConfig({
    ...overrides,
    apiKey: overrides.apiKey || apiKeyFromHeader,
    athleteId: overrides.athleteId || athleteIdFromHeader,
  })
}

export function hasIntervalsConfig(config: IntervalsConfig): boolean {
  return Boolean(config.baseUrl && config.athleteId && config.apiKey)
}

export function createIntervalsAuthHeader(apiKey: string): string {
  const raw = `API_KEY:${apiKey}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

export async function intervalsRequest(path: string, init: RequestInit = {}, configOverride?: IntervalsConfig): Promise<Response> {
  const config = configOverride || getIntervalsConfig()

  if (!hasIntervalsConfig(config)) {
    throw new Error('Intervals.icu config missing: connect Intervals.icu and provide API key + athlete ID.')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', createIntervalsAuthHeader(config.apiKey))
  headers.set('Content-Type', 'application/json')

  const targetUrl = `${config.baseUrl}${path}`
  const fetchOptions: RequestInit = {
    ...init,
    headers,
    cache: 'no-store',
  }

  const maxAttempts = 4

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response

    try {
      response = await fetch(targetUrl, fetchOptions)
    } catch (error) {
      const causeMessage =
        error instanceof Error && 'cause' in error && (error as Error & { cause?: { message?: string } }).cause
          ? (error as Error & { cause?: { message?: string } }).cause?.message
          : undefined

      throw new Error(
        `Intervals fetch transport failed: ${error instanceof Error ? error.message : 'Unknown error'}${
          causeMessage ? ` (cause: ${causeMessage})` : ''
        }`
      )
    }

    if (response.ok) {
      return response
    }

    const isRetryable = response.status === 429 || response.status >= 500
    if (!isRetryable || attempt === maxAttempts) {
      const text = await response.text()
      if (response.status === 422 && text.includes('Too many events')) {
        console.warn('Intervals event date is at capacity', { path, status: response.status, body: text })
      } else {
        console.error('Intervals API request failed', { path, status: response.status, body: text })
      }
      throw new Error(`Intervals API failed (${response.status}): ${text.slice(0, 200)}`)
    }

    const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
    const delayMs = retryAfter ?? Math.min(8_000, 500 * 2 ** (attempt - 1))
    console.warn('Intervals API request throttled; retrying', { path, status: response.status, attempt, delayMs })
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  throw new Error('Intervals API request exhausted its retry attempts')
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1_000)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.min(10_000, Math.max(0, date - Date.now()))
}

export function toLocalIsoDate(value: Date | number, timeZone = 'UTC'): string {
  return formatDateInTimezone(value, normalizeTimezone(timeZone))
}

export function getTimezoneFromRequest(request: Request): string {
  return normalizeTimezone(request.headers.get('x-athlete-timezone'))
}
