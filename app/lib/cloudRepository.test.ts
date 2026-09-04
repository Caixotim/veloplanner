import { CloudRepository } from './cloudRepository'
import type { TrainingPlan } from './types'

const plan = {
  id: 'plan-1',
  userId: 'user-1',
  name: 'Base',
  goal: 'endurance',
  startDate: new Date('2026-09-07T00:00:00.000Z'),
  endDate: new Date('2026-09-13T00:00:00.000Z'),
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  durationWeeks: 1,
  revision: 0,
  status: 'draft',
  weeks: [],
  mealSuggestions: [],
  targetMetrics: {},
} as TrainingPlan

function response(body: unknown, status: number): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('CloudRepository', () => {
  afterEach(() => { delete (globalThis as { fetch?: typeof fetch }).fetch })

  it('maps cloud plans and hydrates date fields', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({ plans: [{ id: plan.id, revision: 2, plan_json: { ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate.toISOString(), createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() } }] }, 200))
    const result = await new CloudRepository().listPlans()
    expect(result[0].plan.startDate).toEqual(plan.startDate)
    expect(result[0].plan.revision).toBe(2)
  })

  it('returns a repository conflict for a 409 update', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({ error: 'Plan revision conflict', plan: { id: plan.id, revision: 1, plan_json: { ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate.toISOString(), createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() } } }, 409))
    const result = await new CloudRepository().updatePlan({ plan, expectedRevision: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.latest.revision).toBe(1)
  })
})
