

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

  if (!response.ok) {
    const text = await response.text()
    console.error('Intervals API request failed', { path, status: response.status, body: text })
    throw new Error(`Intervals API failed (${response.status}): ${text.slice(0, 200)}`)
  }

  return response
}

export function toLocalIsoDate(value: Date | number): string {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
