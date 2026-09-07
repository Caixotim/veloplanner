import { hydrateTrainingPlanDates } from './planDateHydration'

describe('hydrateTrainingPlanDates', () => {
  it('keeps date-only values on the same local calendar day', () => {
    const plan = hydrateTrainingPlanDates({
      id: 'date-only-plan',
      startDate: '2026-09-13',
      endDate: '2026-09-19',
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      weeks: [{
        weekNumber: 1,
        sessions: [{
          id: 'sunday-session',
          date: '2026-09-13',
          dayOfWeek: 1,
          type: 'endurance',
          duration: 60,
          intensity: 'easy',
          description: 'Sunday endurance',
          focus: [],
          equipment: [],
        }],
      }],
    })

    expect(plan?.startDate.getDate()).toBe(13)
    expect(plan?.weeks[0].sessions[0].date.getDate()).toBe(13)
  })

  it('removes duplicate sessions for the same plan-local date', () => {
    const plan = hydrateTrainingPlanDates({
      id: 'duplicate-plan',
      timezone: 'America/New_York',
      startDate: '2026-09-07',
      endDate: '2026-09-14',
      weeks: [
        {
          weekNumber: 1,
          sessions: [
            {
              id: 'short-session',
              date: '2026-09-08T04:00:00.000Z',
              dayOfWeek: 2,
              type: 'recovery',
              duration: 30,
              intensity: 'easy',
              description: 'Recovery',
              focus: [],
              equipment: [],
            },
            {
              id: 'canonical-session',
              date: '2026-09-08T23:00:00.000Z',
              dayOfWeek: 2,
              type: 'endurance',
              duration: 60,
              intensity: 'easy',
              description: 'Endurance',
              focus: [],
              equipment: [],
            },
          ],
        },
      ],
    })

    expect(plan?.weeks[0].sessions.map((session) => session.id)).toEqual(['canonical-session'])
    expect(plan?.weeks[0].totalHours).toBe(1)
  })

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
