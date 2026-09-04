export const DEFAULT_TIMEZONE = 'UTC'

export function getDefaultTimezone(): string {
  if (typeof Intl === 'undefined') return DEFAULT_TIMEZONE
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

export function normalizeTimezone(timeZone: unknown): string {
  return typeof timeZone === 'string' && isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE
}

export function formatDateInTimezone(value: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatDateTimeInTimezone(value: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
}
