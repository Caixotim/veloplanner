import { parsePlanStartDate } from './planRequest'

describe('parsePlanStartDate', () => {
  const today = new Date(2026, 8, 1)

  it('accepts an ISO date', () => {
    expect(parsePlanStartDate('Create a plan starting 2026-10-12', today)).toBe('2026-10-12')
  })

  it('accepts European numeric dates', () => {
    expect(parsePlanStartDate('começar em 15/09/2026', today)).toBe('2026-09-15')
  })

  it('resolves English and Portuguese weekdays to the next occurrence', () => {
    expect(parsePlanStartDate('start next Monday', today)).toBe('2026-09-07')
    expect(parsePlanStartDate('começar na próxima quarta-feira', today)).toBe('2026-09-09')
  })
})