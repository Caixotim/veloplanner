import type { TrainingPlan } from './types'
import { storage } from './storage'

function createTestPlan(id: string): TrainingPlan {
  const startDate = new Date('2026-09-07T08:00:00.000Z')
  const sessionDate = new Date('2026-09-08T08:00:00.000Z')

  return {
    id,
    userId: 'storage-test-athlete',
    status: 'draft',
    revision: 0,
    name: 'Storage test plan',
    goal: 'endurance',
    durationWeeks: 1,
    startDate,
    endDate: new Date('2026-09-13T08:00:00.000Z'),
    weeks: [{
      weekNumber: 1,
      phase: 'base',
      focusPoints: ['Consistency'],
      totalHours: 1,
      sessions: [{
        id: `${id}-session`,
        date: sessionDate,
        dayOfWeek: 2,
        type: 'endurance',
        duration: 60,
        intensity: 'moderate',
        description: 'Easy endurance ride',
        focus: ['Aerobic base'],
        equipment: ['indoor_trainer'],
      }],
    }],
    mealSuggestions: [],
    targetMetrics: { enduranceHours: 1 },
    createdAt: startDate,
    updatedAt: startDate,
  }
}

describe('IndexedDB storage integration', () => {
  it('persists plans, edits, sync metadata, and rides across reads', async () => {
    const plan = createTestPlan(`storage-${Date.now()}`)

    await storage.savePlan(plan)
    await storage.recordEdit(plan.id, {
      sessionId: `${plan.id}-session`,
      weekNumber: 1,
      dayIndex: 1,
      timestamp: Date.now(),
      changes: { duration: { before: 60, after: 75 } },
    })
    await storage.updateSyncMetadata({ lastSyncTime: 123_456, lastSyncStatus: 'success', totalRidesSynced: 1 })
    await storage.cacheRide(`ride-${plan.id}`, { rideDate: 123_456, trainingLoad: 42 })

    const stored = await storage.loadPlan(plan.id)
    const edits = await storage.getEditHistory(plan.id)
    const metadata = await storage.getSyncMetadata()
    const rides = await storage.getCachedRides(0)

    expect(stored?.plan.startDate).toEqual(plan.startDate)
    expect(stored?.plan.weeks[0].sessions[0].date).toEqual(plan.weeks[0].sessions[0].date)
    expect(edits).toHaveLength(1)
    expect(metadata).toMatchObject({ lastSyncTime: 123_456, lastSyncStatus: 'success', totalRidesSynced: 1 })
    expect(rides).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `ride-${plan.id}`, trainingLoad: 42 }),
    ]))

    await storage.deletePlan(plan.id)
    expect(await storage.loadPlan(plan.id)).toBeUndefined()
  })

  it('isolates account-scoped cache namespaces', async () => {
    const accountAPlan = createTestPlan(`account-a-${Date.now()}`)
    const accountBPlan = createTestPlan(`account-b-${Date.now()}`)

    await storage.setAccountScope('account-a')
    await storage.savePlan(accountAPlan)
    expect(await storage.loadPlan(accountAPlan.id)).toBeDefined()

    await storage.setAccountScope('account-b')
    expect(await storage.loadPlan(accountAPlan.id)).toBeUndefined()
    await storage.savePlan(accountBPlan)
    expect(await storage.loadPlan(accountBPlan.id)).toBeDefined()

    await storage.setAccountScope()
    expect(await storage.loadPlan(accountAPlan.id)).toBeUndefined()
    expect(await storage.loadPlan(accountBPlan.id)).toBeUndefined()
  })
})
