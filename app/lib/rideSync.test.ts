import { filterStableActivities, getRideCursor, hasStableActivityId } from './rideSync'

describe('ride sync helpers', () => {
  it('accepts numeric and non-empty string provider IDs', () => {
    expect(hasStableActivityId({ id: 123 })).toBe(true)
    expect(hasStableActivityId({ id: 'ride-123' })).toBe(true)
  })

  it('rejects missing, null, and empty provider IDs', () => {
    expect(hasStableActivityId({})).toBe(false)
    expect(hasStableActivityId({ id: null })).toBe(false)
    expect(hasStableActivityId({ id: '  ' })).toBe(false)
  })

  it('filters activities without stable IDs instead of creating local identities', () => {
    const activities = [{ id: 1 }, { id: undefined }, { id: '2' }, { id: null }]

    expect(filterStableActivities(activities).map((activity) => activity.id)).toEqual([1, '2'])
  })

  it('uses the newest valid ride date as the cursor', () => {
    expect(getRideCursor([100, 500, 300], 999)).toBe(500)
    expect(getRideCursor([Number.NaN, -1], 999)).toBe(999)
  })
})
