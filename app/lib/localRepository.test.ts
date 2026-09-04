import { LocalRepository, type LocalRepositoryStorage } from './localRepository'
import type { TrainingPlan, UserProfile } from './types'
import type { StoredPlan } from './storage'

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

function createBackend(initialPlan?: TrainingPlan): LocalRepositoryStorage & { deleted: string[] } {
  let storedPlan: StoredPlan | undefined = initialPlan
    ? { id: initialPlan.id, plan: initialPlan, originalPlan: initialPlan, createdAt: 1, updatedAt: 1, edits: [], isModified: false }
    : undefined
  const deleted: string[] = []

  return {
    deleted,
    loadProfile: async (_id: string): Promise<UserProfile | undefined> => undefined,
    saveProfile: async (_profile: UserProfile) => undefined,
    loadAllPlans: async () => (storedPlan ? [storedPlan] : []),
    loadPlan: async () => storedPlan,
    savePlan: async (nextPlan) => {
      storedPlan = { id: nextPlan.id, plan: nextPlan, originalPlan: nextPlan, createdAt: 1, updatedAt: 1, edits: [], isModified: false }
      return nextPlan.id
    },
    updatePlan: async (_id, updates) => {
      if (storedPlan) storedPlan = { ...storedPlan, plan: { ...storedPlan.plan, ...updates } }
    },
    deletePlan: async (id) => {
      deleted.push(id)
      storedPlan = undefined
    },
  }
}

describe('LocalRepository', () => {
  it('rejects stale updates without modifying local storage', async () => {
    const backend = createBackend({ ...plan, revision: 2 })
    const repository = new LocalRepository(backend)

    const result = await repository.updatePlan({ plan: { ...plan, name: 'stale' }, expectedRevision: 1 })

    expect(result.ok).toBe(false)
    expect(backend.deleted).toEqual([])
    expect((await backend.loadPlan('plan-1'))?.plan.name).toBe('Test plan')
  })

  it('increments revisions for accepted updates', async () => {
    const backend = createBackend({ ...plan, revision: 2 })
    const repository = new LocalRepository(backend)

    const result = await repository.updatePlan({ plan: { ...plan, name: 'updated' }, expectedRevision: 2 })

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ name: 'updated', revision: 3 }) })
  })

  it('does not delete after a stale delete request', async () => {
    const backend = createBackend({ ...plan, revision: 4 })
    const repository = new LocalRepository(backend)

    const result = await repository.deletePlan(plan.id, 3)

    expect(result.ok).toBe(false)
    expect(backend.deleted).toEqual([])
  })
})
