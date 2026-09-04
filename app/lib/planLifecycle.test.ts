import { archivePlan, getPlanStatus, publishPlan } from './planLifecycle'
import type { TrainingPlan } from './types'

const plan: TrainingPlan = {
  id: 'plan-1',
  userId: 'athlete-1',
  name: 'Test plan',
  goal: 'endurance',
  durationWeeks: 1,
  startDate: new Date('2026-09-07T00:00:00.000Z'),
  endDate: new Date('2026-09-14T00:00:00.000Z'),
  weeks: [],
  mealSuggestions: [],
  targetMetrics: {},
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
}

describe('plan lifecycle', () => {
  it('treats legacy plans without status as drafts', () => {
    expect(getPlanStatus(plan)).toBe('draft')
  })

  it('publishes a plan with an initial revision and timestamp', () => {
    const published = publishPlan(plan, '2026-09-04T12:00:00.000Z')

    expect(published.status).toBe('active')
    expect(published.revision).toBe(1)
    expect(published.publishedAt).toBe('2026-09-04T12:00:00.000Z')
    expect(published.updatedAt.toISOString()).toBe('2026-09-04T12:00:00.000Z')
  })

  it('does not lower an existing revision when publishing', () => {
    const published = publishPlan({ ...plan, revision: 4 }, '2026-09-04T12:00:00.000Z')

    expect(published.revision).toBe(4)
  })

  it('archives without deleting the plan data', () => {
    const archived = archivePlan({ ...plan, revision: 2 })

    expect(archived.status).toBe('archived')
    expect(archived.revision).toBe(3)
    expect(archived.weeks).toEqual(plan.weeks)
  })
})
