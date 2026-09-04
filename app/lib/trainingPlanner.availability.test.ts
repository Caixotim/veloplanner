import { generateTrainingPlan } from './trainingPlanner'
import type { UserProfile } from './types'

describe('generateTrainingPlan availability constraints', () => {
  it('does not schedule sessions on unavailable days or beyond the available time', () => {
    const profile: UserProfile = {
      id: 'athlete-1',
      age: 35,
      height: 180,
      weight: 75,
      goal: 'ftp_increase',
      injuries: [],
      equipment: [],
      hasPowerMeter: false,
      availableTime: {
        monday: 0,
        tuesday: 0.5,
        wednesday: 1.25,
        thursday: 0,
        friday: 1.75,
        saturday: 1.3,
        sunday: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const plan = generateTrainingPlan(
      profile.id,
      {
        name: 'Availability test',
        goal: profile.goal,
        durationWeeks: 1,
        startDate: new Date(2026, 8, 7, 6),
      },
      profile,
    )

    expect(plan.status).toBe('draft')
    expect(plan.revision).toBe(0)

    const availableHoursByDay = profile.availableTime
    for (const session of plan.weeks[0].sessions) {
      const dayName = session.date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof typeof availableHoursByDay
      const availableMinutes = (availableHoursByDay[dayName] || 0) * 60

      expect(session.duration).toBeLessThanOrEqual(availableMinutes)
      if (availableMinutes === 0) {
        expect(session.duration).toBe(0)
      }
    }
  })

  it('uses only the athlete\'s available day when all other days are unavailable', () => {
    const profile: UserProfile = {
      id: 'athlete-sunday-only',
      age: 35,
      height: 180,
      weight: 75,
      goal: 'endurance',
      injuries: ['none'],
      equipment: [],
      hasPowerMeter: false,
      availableTime: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 0,
        sunday: 3,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const plan = generateTrainingPlan(
      profile.id,
      { name: 'Sunday-only test', goal: profile.goal, durationWeeks: 1, startDate: new Date(2026, 8, 7, 6) },
      profile,
    )

    const trainableSessions = plan.weeks[0].sessions.filter((session) => session.duration > 0)
    expect(trainableSessions).toHaveLength(1)
    expect(trainableSessions[0].date.getDay()).toBe(0)
    expect(trainableSessions[0].duration).toBeLessThanOrEqual(180)
  })

  it('starts each generated week after the previous week without date overlap', () => {
    const profile: UserProfile = {
      id: 'athlete-two-weeks',
      age: 35,
      height: 180,
      weight: 75,
      goal: 'endurance',
      injuries: ['none'],
      equipment: [],
      hasPowerMeter: false,
      availableTime: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 3 },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const plan = generateTrainingPlan(
      profile.id,
      { name: 'Two-week test', goal: profile.goal, durationWeeks: 2, startDate: new Date(2026, 8, 7, 6) },
      profile,
    )

    const weekOneDates = plan.weeks[0].sessions.map((session) => session.date.toISOString())
    const weekTwoDates = plan.weeks[1].sessions.map((session) => session.date.toISOString())
    expect(weekOneDates.some((date) => weekTwoDates.includes(date))).toBe(false)
    expect(plan.weeks[1].sessions[0].date.getTime()).toBeGreaterThan(plan.weeks[0].sessions[0].date.getTime())
  })
})
