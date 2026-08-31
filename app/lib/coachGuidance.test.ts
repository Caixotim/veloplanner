import { buildCoachGuidance } from './coachGuidance'
import type { TrainingPlan, TrainingSession } from './types'

const session = { type: 'threshold', intensity: 'hard', focus: ['steady power'] } as TrainingSession
const plan = { goal: 'ftp_increase' } as TrainingPlan
const recentRides = [{ date: Date.now(), duration: 3600 }, { date: Date.now() - 86400000, duration: 1800 }]

describe('buildCoachGuidance', () => {
  it('opens the editor for a short-time request', () => {
    const result = buildCoachGuidance({ question: 'I only have 45 minutes', plan, session })

    expect(result?.shouldOpenEditor).toBe(false)
    expect(result?.answer).toContain('45 minutes')
    expect(result?.suggestedDurationMinutes).toBe(45)
  })

  it('gives recovery guidance without editing for a recovery question', () => {
    const result = buildCoachGuidance({ question: 'Should I recover today?', plan, session })

    expect(result?.shouldOpenEditor).toBe(false)
    expect(result?.answer).toContain('Keep the session easy')
  })

  it('proposes an easy session for an explicit recovery change', () => {
    const result = buildCoachGuidance({ question: 'Make today a recovery ride', plan, session })

    expect(result?.suggestedIntensity).toBe('easy')
    expect(result?.shouldOpenEditor).toBe(false)
  })

  it('combines duration and intensity changes in one proposal', () => {
    const result = buildCoachGuidance({ question: 'I only have 45 minutes and want to go easier', plan, session })

    expect(result?.suggestedDurationMinutes).toBe(45)
    expect(result?.suggestedIntensity).toBe('easy')
  })

  it('proposes a controlled harder effort for an explicit request', () => {
    const result = buildCoachGuidance({ question: 'Can I go harder today?', plan, session })

    expect(result?.suggestedIntensity).toBe('hard')
    expect(result?.shouldOpenEditor).toBe(false)
  })

  it('recommends a session using the goal and recent volume', () => {
    const result = buildCoachGuidance({ question: 'What would be a good session today?', plan, session, recentRides })

    expect(result?.answer).toContain('threshold session')
    expect(result?.answer).toContain('1.5 hours')
  })

  it('proposes a specific session type change', () => {
    const result = buildCoachGuidance({ question: 'Make today a tempo session', plan, session })

    expect(result?.suggestedSessionType).toBe('tempo')
    expect(result?.shouldOpenEditor).toBe(false)
  })

  it('reveals metrics when they are explicitly requested', () => {
    const result = buildCoachGuidance({ question: 'Show me my training graph', plan, session })

    expect(result?.shouldShowMetrics).toBe(true)
    expect(result?.shouldOpenCalendar).toBe(false)
  })

  it('explains the purpose of a session', () => {
    const result = buildCoachGuidance({ question: 'Why this workout?', plan, session })

    expect(result?.answer).toContain('ftp increase')
    expect(result?.answer).toContain('steady power')
  })

  it('returns null for an empty question', () => {
    expect(buildCoachGuidance({ question: '  ', plan, session })).toBeNull()
  })

  it('routes schedule changes to the calendar', () => {
    const result = buildCoachGuidance({ question: 'Can I move this to tomorrow?', plan, session })

    expect(result?.shouldOpenCalendar).toBe(true)
    expect(result?.shouldOpenEditor).toBe(false)
  })

  it('explains the intended intensity', () => {
    const result = buildCoachGuidance({ question: 'How hard should I ride?', plan, session })

    expect(result?.answer).toContain('threshold')
    expect(result?.answer).toContain('hard effort')
  })
})
