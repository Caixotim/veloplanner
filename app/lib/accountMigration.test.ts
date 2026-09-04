import { migrateLocalAccount } from './accountMigration'
import type { PlanRepository } from './repository'
import type { StoredPlan } from './storage'
import type { UserProfile } from './types'
import type { TrainingSession } from './types'

const profile = { id: 'profile-1', timezone: 'Europe/Lisbon' } as UserProfile
const stored = (id: string, sessions: TrainingSession[] = []): StoredPlan => ({ id, plan: { id, userId: 'local', name: id, goal: 'endurance', durationWeeks: 1, startDate: new Date(), endDate: new Date(), weeks: sessions.length ? [{ weekNumber: 1, phase: 'base', focusPoints: [], sessions, totalHours: 1 }] : [], mealSuggestions: [], targetMetrics: {}, createdAt: new Date(), updatedAt: new Date() }, originalPlan: {} as StoredPlan['plan'], createdAt: 0, updatedAt: 0, edits: [], isModified: false })

describe('migrateLocalAccount', () => {
  it('imports only missing plans and is safe to retry', async () => {
    const imported: string[] = []
    const target: PlanRepository = {
      loadProfile: async () => undefined,
      saveProfile: async () => undefined,
      listPlans: async () => [stored('existing')],
      loadPlan: async () => undefined,
      createPlan: async (plan) => { imported.push(plan.id) },
      listSessions: async () => [],
      createSession: async () => undefined,
      updatePlan: async () => ({ ok: true, value: stored('x').plan }),
      deletePlan: async () => ({ ok: true, value: stored('x').plan }),
    }
    const source = { loadProfile: async () => profile, listPlans: async () => [stored('existing'), stored('new')] }
    const report = await migrateLocalAccount(source, target)
    expect(report).toMatchObject({ profile: 'imported', plansImported: 1, plansSkipped: 1, sessionsImported: 0, sessionsSkipped: 0, failures: [] })
    expect(imported).toEqual(['new'])
  })

  it('imports missing sessions and skips sessions already present remotely', async () => {
    const session = { id: 'session-1', date: new Date('2026-09-07T00:00:00Z') } as TrainingSession
    const imported: string[] = []
    const target: PlanRepository = {
      loadProfile: async () => undefined,
      saveProfile: async () => undefined,
      listPlans: async () => [stored('plan-1')],
      loadPlan: async () => undefined,
      createPlan: async () => undefined,
      listSessions: async () => [session],
      createSession: async ({ session: next }) => { imported.push(next.id) },
      updatePlan: async () => ({ ok: true, value: stored('x').plan }),
      deletePlan: async () => ({ ok: true, value: stored('x').plan }),
    }
    const report = await migrateLocalAccount({ loadProfile: async () => undefined, listPlans: async () => [stored('plan-1', [session, { ...session, id: 'session-2' }])] }, target)
    expect(report).toMatchObject({ plansImported: 0, plansSkipped: 1, sessionsImported: 1, sessionsSkipped: 1, failures: [] })
    expect(imported).toEqual(['session-2'])
  })

  it('reports a failed session without blocking later sessions', async () => {
    const sessions = [{ id: 'bad', date: new Date() }, { id: 'good', date: new Date() }] as TrainingSession[]
    const imported: string[] = []
    const target: PlanRepository = {
      loadProfile: async () => undefined,
      saveProfile: async () => undefined,
      listPlans: async () => [],
      loadPlan: async () => undefined,
      createPlan: async () => undefined,
      listSessions: async () => [],
      createSession: async ({ session }) => { if (session.id === 'bad') throw new Error('temporary failure'); imported.push(session.id) },
      updatePlan: async () => ({ ok: true, value: stored('x').plan }),
      deletePlan: async () => ({ ok: true, value: stored('x').plan }),
    }
    const report = await migrateLocalAccount({ loadProfile: async () => undefined, listPlans: async () => [stored('plan-1', sessions)] }, target)
    expect(report.sessionsImported).toBe(1)
    expect(report.failures).toEqual([{ kind: 'session', id: 'bad', message: 'temporary failure' }])
    expect(imported).toEqual(['good'])
  })
})
