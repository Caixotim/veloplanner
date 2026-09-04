import { deduplicateSyncSessions } from './planSync'
import type { TrainingSession } from './types'

function session(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: 'session-1',
    date: new Date('2026-09-07T08:00:00.000Z'),
    dayOfWeek: 1,
    type: 'endurance',
    duration: 60,
    intensity: 'easy',
    description: 'Easy ride',
    focus: ['aerobic'],
    equipment: [],
    ...overrides,
  }
}

describe('plan sync session deduplication', () => {
  it('removes same-day sessions with the same modality', () => {
    const result = deduplicateSyncSessions([
      { week: 1, session: session({ id: 'first' }) },
      { week: 1, session: session({ id: 'duplicate', duration: 90 }) },
    ])

    expect(result.map(({ session: entry }) => entry.id)).toEqual(['first'])
  })

  it('keeps different modalities on the same day', () => {
    const result = deduplicateSyncSessions([
      { week: 1, session: session({ id: 'ride', type: 'endurance' }) },
      { week: 1, session: session({ id: 'strength', type: 'strength' }) },
    ])

    expect(result).toHaveLength(2)
  })

  it('treats equipment order as irrelevant to modality identity', () => {
    const result = deduplicateSyncSessions([
      { week: 1, session: session({ id: 'first', equipment: ['dumbbells', 'resistance_bands'] }) },
      { week: 1, session: session({ id: 'duplicate', equipment: ['resistance_bands', 'dumbbells'] }) },
    ])

    expect(result).toHaveLength(1)
  })
})
