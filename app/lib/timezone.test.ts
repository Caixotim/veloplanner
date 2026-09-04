import { formatDateInTimezone, normalizeTimezone } from './timezone'

describe('athlete timezone formatting', () => {
  it('formats calendar dates using the athlete timezone', () => {
    const instant = new Date('2026-09-08T00:30:00.000Z')

    expect(formatDateInTimezone(instant, 'America/Los_Angeles')).toBe('2026-09-07')
    expect(formatDateInTimezone(instant, 'Europe/Lisbon')).toBe('2026-09-08')
  })

  it('falls back safely for an invalid or missing timezone', () => {
    expect(normalizeTimezone('not/a-timezone')).toBe('UTC')
    expect(normalizeTimezone(undefined)).toBe('UTC')
  })
})
