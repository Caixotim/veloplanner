import { hydrateTrainingPlanDates } from './planDateHydration'

describe('hydrateTrainingPlanDates', () => {
  it('converts serialized date fields into Date instances', () => {
    const rawPlan = {
      id: 'plan-1',
      userId: 'user-1',
      name: 'Recovered Plan',
      goal: 'ftp_increase',
      durationWeeks: 1,
      startDate: '2026-07-01T06:00:00.000Z',
      endDate: '2026-07-08T06:00:00.000Z',
      weeks: [
        {
          weekNumber: 1,
          phase: 'base',
          focusPoints: [],
          totalHours: 1,
          sessions: [
            {
              id: 'session-1',
              date: '2026-07-01T06:00:00.000Z',
              dayOfWeek: 3,
              type: 'endurance',
              duration: 60,
              intensity: 'moderate',
              description: 'Test session',
              focus: [],
              equipment: [],
            },
          ],
        },
      ],
      mealSuggestions: [],
      targetMetrics: {},
      createdAt: '2026-07-01T06:00:00.000Z',
      updatedAt: '2026-07-01T06:00:00.000Z',
    }

    const hydrated = hydrateTrainingPlanDates(rawPlan)

    expect(hydrated).not.toBeNull()
    expect(hydrated?.startDate).toBeInstanceOf(Date)
    expect(hydrated?.endDate).toBeInstanceOf(Date)
    expect(hydrated?.weeks[0].sessions[0].date).toBeInstanceOf(Date)
    expect(hydrated?.createdAt).toBeInstanceOf(Date)
    expect(hydrated?.updatedAt).toBeInstanceOf(Date)
    expect(typeof hydrated?.startDate.toLocaleDateString).toBe('function')
  })
})
