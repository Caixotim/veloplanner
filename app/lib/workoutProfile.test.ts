import {
  buildWorkoutProfileVisualSteps,
  getWorkoutIntensityPercent,
  getWorkoutZone,
  parseWorkoutProfileSteps,
  summarizeWorkoutProfile,
} from './workoutProfile'

describe('workout profile visualization model', () => {
  it('parses timed workout steps while ignoring metadata', () => {
    const steps = parseWorkoutProfileSteps([
      'Workout Level 4.2',
      "Warm-up 12' at 55-65% FTP",
      "Set 1 10' at 95-100% FTP",
      "Recovery 3' at 50-60% FTP",
    ], { fallback: false })

    expect(steps).toEqual([
      { id: 'step_1', minutes: 12, target: '55-65% FTP', note: 'Warm-up' },
      { id: 'step_2', minutes: 10, target: '95-100% FTP', note: 'Set 1' },
      { id: 'step_3', minutes: 3, target: '50-60% FTP', note: 'Recovery' },
    ])
  })

  it('uses interval range midpoint for profile height and zones', () => {
    expect(getWorkoutIntensityPercent('95-100% FTP')).toBe(97.5)
    expect(getWorkoutZone('95-100% FTP', true)).toBe('Z4')
    expect(getWorkoutZone('55-65% FTP', true)).toBe('Z2')
  })

  it('provides an editable fallback when a session has no timed steps', () => {
    expect(parseWorkoutProfileSteps(['Rest day'])).toHaveLength(2)
    expect(getWorkoutIntensityPercent('Max sprint')).toBeGreaterThan(100)
  })

  it('builds duration-weighted visual metadata for the session graph', () => {
    const steps = parseWorkoutProfileSteps([
      "Warm-up 10' at 55-65% FTP",
      "Threshold 20' at 95-100% FTP",
    ], { fallback: false })

    expect(buildWorkoutProfileVisualSteps(steps, true)).toEqual([
      expect.objectContaining({ zone: 'Z2', intensityPercent: 60, height: expect.any(Number) }),
      expect.objectContaining({ zone: 'Z4', intensityPercent: 97.5, height: expect.any(Number) }),
    ])
  })

  it('summarizes quality, recovery, and average intensity by time', () => {
    const summary = summarizeWorkoutProfile([
      { id: 'warmup', minutes: 10, target: '55-65% FTP', note: 'Warm-up' },
      { id: 'work', minutes: 20, target: '95-100% FTP', note: 'Threshold' },
    ])

    expect(summary).toEqual({
      totalMinutes: 30,
      qualityMinutes: 20,
      recoveryMinutes: 10,
      averageIntensityPercent: 85,
    })
  })
})
