import { useState, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import styles from './UserProfileForm.module.scss'
import type {
  UserProfile,
  Equipment,
  InjuryType,
  IntensityDistribution,
  TrainingGoal,
  QualityPriority,
  ShortDayPreference,
  DietPreference,
} from '@/app/lib/types'

type PlannedEventDraft = {
  id: string
  name: string
  date: string
  priority: 'A' | 'B' | 'C'
}

interface UserProfileFormProps {
  onSubmit: (profile: Partial<UserProfile>) => void
  loading?: boolean
  initialProfile?: Partial<UserProfile>
  title?: string
  submitLabel?: string
  showPlanInputs?: boolean
  showAthleteDetails?: boolean
  compactCreation?: boolean
  children?: ReactNode
}

const EQUIPMENT_OPTIONS: Array<{ id: Equipment; label: string; icon: string }> = [
  { id: 'indoor_trainer', label: 'Indoor Trainer', icon: '🏋️' },
  { id: 'resistance_bands', label: 'Resistance Bands', icon: '🎯' },
  { id: 'rowing_machine', label: 'Rowing Machine', icon: '🚣' },
  { id: 'dumbbells', label: 'Dumbbells', icon: '⚖️' },
]

const INJURIES: Array<{ id: InjuryType; label: string }> = [
  { id: 'knee', label: 'Knee Issues' },
  { id: 'lower_back', label: 'Lower Back Pain' },
  { id: 'shoulder', label: 'Shoulder Issues' },
  { id: 'none', label: 'No injuries' },
]

const GOAL_OPTIONS: Array<{ id: TrainingGoal; label: string; description: string }> = [
  { id: 'ftp_increase', label: 'Increase FTP', description: 'Raise your sustainable power output.' },
  { id: 'climbing_sustainability', label: 'Improve Climbing', description: 'Sustain harder efforts uphill for longer.' },
  { id: 'endurance', label: 'Build Endurance', description: 'Increase long-ride stamina and pacing.' },
  { id: 'recovery', label: 'Recovery Block', description: 'Reduce load and recover consistently.' },
]

const INTENSITY_DISTRIBUTION_OPTIONS: Array<{
  id: IntensityDistribution
  label: string
  description: string
}> = [
  {
    id: 'conservative',
    label: 'Conservative (Default)',
    description: 'Favors more spacing between hard sessions and easier fallback substitutions.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Allows tighter hard-session spacing and keeps high-intensity density higher.',
  },
]

const QUALITY_PRIORITY_OPTIONS: Array<{
  id: QualityPriority
  label: string
  description: string
}> = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Protect consistency by favoring easier substitutions on short days.',
  },
  {
    id: 'balanced',
    label: 'Balanced (Default)',
    description: 'Mixes quality and recovery to keep weekly progression sustainable.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Pushes more quality density when readiness and recovery are good.',
  },
]

const SHORT_DAY_PREFERENCE_OPTIONS: Array<{
  id: ShortDayPreference
  label: string
  description: string
}> = [
  {
    id: 'mixed',
    label: 'Mixed (Default)',
    description: 'Uses a rotating blend of VO2, threshold, and supporting work.',
  },
  {
    id: 'vo2_micro',
    label: 'VO2 Micro-Intervals',
    description: 'Biases short sessions toward dense VO2-focused interval work.',
  },
  {
    id: 'threshold_blocks',
    label: 'Threshold Blocks',
    description: 'Prefers broken threshold intervals for sustained aerobic quality.',
  },
  {
    id: 'strength_focus',
    label: 'Strength Focus',
    description: 'Converts short slots toward strength support when equipment allows.',
  },
]

const DIET_PREFERENCE_OPTIONS: Array<{ id: DietPreference; label: string; description: string }> = [
  { id: 'mediterranean', label: 'Mediterranean (Default)', description: 'Balanced whole foods with olive oil, legumes, fish, and vegetables.' },
  { id: 'balanced', label: 'Balanced', description: 'No strict diet pattern; broad variety with macro guidance.' },
  { id: 'high_protein', label: 'High Protein', description: 'Higher protein meals to support muscle repair and strength adaptations.' },
  { id: 'vegetarian', label: 'Vegetarian', description: 'No meat; includes dairy/eggs if present in recipes.' },
  { id: 'vegan', label: 'Vegan', description: 'Plant-based only.' },
  { id: 'pescetarian', label: 'Pescetarian', description: 'Fish allowed, no meat.' },
]

export function UserProfileForm({
  onSubmit,
  loading,
  initialProfile,
  title = 'Your Profile',
  submitLabel = 'Create Training Plan',
  showPlanInputs = true,
  showAthleteDetails = true,
  compactCreation = false,
}: UserProfileFormProps) {
  const [profile, setProfile] = useState<Partial<UserProfile>>(() => mergeWithDefaultProfile(initialProfile))
  const [planDescription, setPlanDescription] = useState('')
  const [planDescriptionFeedback, setPlanDescriptionFeedback] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(profile)
  }

  const toggleEquipment = (equipment: Equipment) => {
    setProfile(prev => ({
      ...prev,
      equipment: prev.equipment?.includes(equipment)
        ? prev.equipment.filter(e => e !== equipment)
        : [...(prev.equipment || []), equipment],
    }))
  }

  const toggleInjury = (injury: InjuryType) => {
    setProfile(prev => ({
      ...prev,
      injuries: prev.injuries?.includes(injury)
        ? prev.injuries.filter(i => i !== injury)
        : [...(prev.injuries || []), injury],
    }))
  }

  const updatePlannedEvent = (index: number, next: Partial<PlannedEventDraft>) => {
    const current = (profile.plannedEvents || []) as PlannedEventDraft[]
    const updated = [...current]
    const existing = updated[index] || { id: `event_${index + 1}`, name: '', date: '', priority: 'C' as const }
    updated[index] = { ...existing, ...next }
    setProfile((prev) => ({ ...prev, plannedEvents: updated }))
  }

  const applyPlanDescription = () => {
    const normalized = planDescription.trim().toLowerCase()
    if (!normalized) return

    const goal: TrainingGoal = normalized.includes('climb') || normalized.includes('hill')
      ? 'climbing_sustainability'
      : normalized.includes('endurance') || normalized.includes('long ride') || normalized.includes('gran fondo')
        ? 'endurance'
        : normalized.includes('recover') || normalized.includes('rest')
          ? 'recovery'
          : 'ftp_increase'
    const weeksMatch = normalized.match(/(\d+)\s*weeks?/)
    const requestedWeeks = weeksMatch ? Math.max(4, Math.min(30, Number(weeksMatch[1]))) : undefined
    const startDateMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
    const ageMatch = normalized.match(/\b(\d{2})\s*(?:years? old|yo)\b/)
    const weightMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*kg\b/)
    const ftpMatch = normalized.match(/\b(\d{2,3})\s*w(?:atts?)?\b/)
    const weekdayPattern = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:for|:)?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g
    const weekdayHours = { ...(profile.availableTime || {}) }
    let availabilityCount = 0
    for (const match of normalized.matchAll(weekdayPattern)) {
      const day = match[1] as keyof UserProfile['availableTime']
      weekdayHours[day] = Number(match[2])
      availabilityCount += 1
    }
    const nextMonday = new Date()
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7))
    const inferredStartDate = startDateMatch?.[1] || `${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, '0')}-${String(nextMonday.getDate()).padStart(2, '0')}`

    setProfile((current) => ({
      ...current,
      goal,
      ...(requestedWeeks ? { desiredPlanWeeks: requestedWeeks } : {}),
      planStartDate: inferredStartDate,
      ...(ageMatch ? { age: Number(ageMatch[1]) } : {}),
      ...(weightMatch ? { weight: Number(weightMatch[1]) } : {}),
      ...(ftpMatch ? { ftp: Number(ftpMatch[1]) } : {}),
      ...(availabilityCount ? { availableTime: weekdayHours } : {}),
    }))
    const details = [
      requestedWeeks && `${requestedWeeks} weeks`,
      ageMatch && `${ageMatch[1]} years old`,
      weightMatch && `${weightMatch[1]} kg`,
      ftpMatch && `${ftpMatch[1]}W FTP`,
      availabilityCount && `${availabilityCount} availability entries`,
    ].filter(Boolean).join(', ')
    setPlanDescriptionFeedback(`Understood: ${goal.replace(/_/g, ' ')}${details ? ` (${details})` : ''}, starting ${inferredStartDate}. Review the fields below before creating the plan.`)
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h2 className={styles.title}>{title}</h2>

      {showPlanInputs && (
      <div className={styles.section}>
        <h3>Plan Inputs</h3>
        <p className={styles.hint}>These settings define what gets scheduled and when it starts.</p>

        <div className={styles.descriptionInput}>
          <label htmlFor="plan-description">Describe the plan you want</label>
          <div className={styles.descriptionInputRow}>
            <input
              id="plan-description"
              type="text"
              value={planDescription}
              onChange={(event) => setPlanDescription(event.target.value)}
              placeholder="e.g. Build endurance for 12 weeks starting 2026-09-07"
              disabled={loading}
            />
            <button type="button" className={styles.secondaryButton} onClick={applyPlanDescription} disabled={loading || !planDescription.trim()}>Use description</button>
          </div>
          {planDescriptionFeedback && <small className={styles.descriptionFeedback}>{planDescriptionFeedback}</small>}
        </div>

        <div className={styles.grid}>
          <div className={styles.group}>
            <label htmlFor="planName">Plan Name</label>
            <input
              id="planName"
              type="text"
              value={profile.planName || ''}
              onChange={e => setProfile({ ...profile, planName: e.target.value })}
              required
              disabled={loading}
              placeholder="e.g. Autumn FTP Build"
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="goal">Training Goal</label>
            <select
              id="goal"
              value={profile.goal || 'ftp_increase'}
              onChange={e => setProfile({ ...profile, goal: e.target.value as TrainingGoal })}
              required
              disabled={loading}
            >
              {GOAL_OPTIONS.map((goalOption) => (
                <option key={goalOption.id} value={goalOption.id}>
                  {goalOption.label}
                </option>
              ))}
            </select>
            <small className={styles.goalHint}>
              {GOAL_OPTIONS.find((goalOption) => goalOption.id === (profile.goal || 'ftp_increase'))?.description}
            </small>
          </div>

          <div className={styles.group}>
            <label htmlFor="planStartDate">Plan Start Date</label>
            <input
              id="planStartDate"
              type="date"
              value={profile.planStartDate || ''}
              onChange={e => setProfile({ ...profile, planStartDate: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="desiredPlanWeeks">Goal Timeframe (weeks)</label>
            <input
              id="desiredPlanWeeks"
              type="number"
              min="4"
              max="30"
              value={profile.desiredPlanWeeks || 12}
              onChange={e => setProfile({ ...profile, desiredPlanWeeks: parseInt(e.target.value, 10) || 12 })}
              required
              disabled={loading}
            />
          </div>

          {!compactCreation && <div className={styles.group}>
            <label htmlFor="intensityDistribution">Intensity Distribution</label>
            <select
              id="intensityDistribution"
              value={profile.intensityDistribution || 'conservative'}
              onChange={e => setProfile({ ...profile, intensityDistribution: e.target.value as IntensityDistribution })}
              disabled={loading}
            >
              {INTENSITY_DISTRIBUTION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className={styles.goalHint}>
              {INTENSITY_DISTRIBUTION_OPTIONS.find((option) => option.id === (profile.intensityDistribution || 'conservative'))?.description}
            </small>
          </div>}

          {!compactCreation && profile.goal === 'ftp_increase' && (
            <div className={styles.group}>
              <label htmlFor="ftpIncreaseTargetWatts">Target FTP Increase (watts)</label>
              <input
                id="ftpIncreaseTargetWatts"
                type="number"
                min="0"
                max="80"
                value={profile.ftpIncreaseTargetWatts ?? 0}
                onChange={e => {
                  const parsedValue = parseInt(e.target.value, 10)
                  setProfile({
                    ...profile,
                    ftpIncreaseTargetWatts: Number.isNaN(parsedValue) ? undefined : parsedValue,
                  })
                }}
                required
                disabled={loading}
              />
              <small className={styles.goalHint}>Set to 0 to auto-assess from current FTP, plan duration, weekly availability, and recent ride load.</small>
            </div>
          )}

          {!compactCreation && <div className={styles.groupWide}>
            <label>Target Events (A/B/C Priority)</label>
            <div className={styles.eventsGrid}>
              {[0, 1, 2].map((index) => {
                const event = (profile.plannedEvents?.[index] as PlannedEventDraft | undefined) || {
                  id: `event_${index + 1}`,
                  name: '',
                  date: '',
                  priority: index === 0 ? 'A' : index === 1 ? 'B' : 'C',
                }

                return (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventHeader}>
                      <span>Event {index + 1}</span>
                    </div>
                    <input
                      type="text"
                      value={event.name}
                      onChange={(e) => updatePlannedEvent(index, { name: e.target.value })}
                      placeholder="Event name"
                      disabled={loading}
                    />
                    <input
                      type="date"
                      value={event.date}
                      onChange={(e) => updatePlannedEvent(index, { date: e.target.value })}
                      disabled={loading}
                    />
                    <select
                      value={event.priority}
                      onChange={(e) => updatePlannedEvent(index, { priority: e.target.value as 'A' | 'B' | 'C' })}
                      disabled={loading}
                    >
                      <option value="A">A Priority</option>
                      <option value="B">B Priority</option>
                      <option value="C">C Priority</option>
                    </select>
                  </div>
                )
              })}
            </div>
            <small className={styles.goalHint}>Planner uses A/B/C event dates to shape taper and key-session density near race weeks.</small>
          </div>}
        </div>
      </div>
      )}

      <details className={styles.advancedOptions}>
        <summary>Fine-tune coaching (optional)</summary>

      {(showPlanInputs || showAthleteDetails) && (
        <div className={styles.section}>
          <h3>Time-Crunched Strategy</h3>
          <p className={styles.hint}>Tune how short training windows are converted into quality sessions across each week.</p>

          <div className={styles.grid}>
            <div className={styles.group}>
              <label htmlFor="qualityPriority">Quality Priority</label>
              <select
                id="qualityPriority"
                value={profile.qualityPriority || 'balanced'}
                onChange={e => setProfile({ ...profile, qualityPriority: e.target.value as QualityPriority })}
                disabled={loading}
              >
                {QUALITY_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className={styles.goalHint}>
                {QUALITY_PRIORITY_OPTIONS.find((option) => option.id === (profile.qualityPriority || 'balanced'))?.description}
              </small>
            </div>

            <div className={styles.group}>
              <label htmlFor="hardSessionsPerWeekCap">Hard Sessions Per Week Cap</label>
              <select
                id="hardSessionsPerWeekCap"
                value={profile.hardSessionsPerWeekCap || 2}
                onChange={e => {
                  const value = parseInt(e.target.value, 10)
                  const normalizedCap = value === 1 || value === 2 || value === 3 ? value : 2
                  setProfile({ ...profile, hardSessionsPerWeekCap: normalizedCap as 1 | 2 | 3 })
                }}
                disabled={loading}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
              <small className={styles.goalHint}>Hard sessions include threshold, VO2, and anaerobic workout days.</small>
            </div>

            <div className={styles.group}>
              <label htmlFor="shortDayPreference">Short-Day Preference</label>
              <select
                id="shortDayPreference"
                value={profile.shortDayPreference || 'mixed'}
                onChange={e => setProfile({ ...profile, shortDayPreference: e.target.value as ShortDayPreference })}
                disabled={loading}
              >
                {SHORT_DAY_PREFERENCE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className={styles.goalHint}>
                {SHORT_DAY_PREFERENCE_OPTIONS.find((option) => option.id === (profile.shortDayPreference || 'mixed'))?.description}
              </small>
            </div>
          </div>
        </div>
      )}

      {(showPlanInputs || showAthleteDetails) && (
        <div className={styles.section}>
          <h3>Nutrition Preferences</h3>
          <p className={styles.hint}>Used to shape diet-aligned meal suggestions with optional macro targets.</p>

          <div className={styles.grid}>
            <div className={styles.group}>
              <label htmlFor="dietPreference">Diet Pattern</label>
              <select
                id="dietPreference"
                value={profile.dietPreference || 'mediterranean'}
                onChange={e => setProfile({ ...profile, dietPreference: e.target.value as DietPreference })}
                disabled={loading}
              >
                {DIET_PREFERENCE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className={styles.goalHint}>
                {DIET_PREFERENCE_OPTIONS.find((option) => option.id === (profile.dietPreference || 'mediterranean'))?.description}
              </small>
            </div>

            <div className={styles.group}>
              <label htmlFor="dailyCalorieTarget">Daily Calories Target (optional)</label>
              <input
                id="dailyCalorieTarget"
                type="number"
                min="1200"
                max="6000"
                step="50"
                value={profile.dailyCalorieTarget ?? ''}
                onChange={e => setProfile({ ...profile, dailyCalorieTarget: parseInt(e.target.value, 10) || undefined })}
                disabled={loading}
                placeholder="e.g. 2800"
              />
            </div>

            <div className={styles.group}>
              <label htmlFor="dailyProteinTargetGrams">Daily Protein (g, optional)</label>
              <input
                id="dailyProteinTargetGrams"
                type="number"
                min="40"
                max="300"
                step="5"
                value={profile.dailyProteinTargetGrams ?? ''}
                onChange={e => setProfile({ ...profile, dailyProteinTargetGrams: parseInt(e.target.value, 10) || undefined })}
                disabled={loading}
                placeholder="e.g. 140"
              />
            </div>

            <div className={styles.group}>
              <label htmlFor="dailyCarbTargetGrams">Daily Carbs (g, optional)</label>
              <input
                id="dailyCarbTargetGrams"
                type="number"
                min="80"
                max="800"
                step="10"
                value={profile.dailyCarbTargetGrams ?? ''}
                onChange={e => setProfile({ ...profile, dailyCarbTargetGrams: parseInt(e.target.value, 10) || undefined })}
                disabled={loading}
                placeholder="e.g. 380"
              />
            </div>

            <div className={styles.group}>
              <label htmlFor="dailyFatTargetGrams">Daily Fat (g, optional)</label>
              <input
                id="dailyFatTargetGrams"
                type="number"
                min="25"
                max="220"
                step="5"
                value={profile.dailyFatTargetGrams ?? ''}
                onChange={e => setProfile({ ...profile, dailyFatTargetGrams: parseInt(e.target.value, 10) || undefined })}
                disabled={loading}
                placeholder="e.g. 80"
              />
            </div>
          </div>
        </div>
      )}

      {showAthleteDetails && (
      <>
      <div className={styles.section}>
        <h3>Athlete Details</h3>
        <p className={styles.hint}>Stored separately from the plan. These only trigger a plan refresh when they affect training targets.</p>

        <div className={styles.grid}>
          <div className={styles.group}>
            <label htmlFor="age">Age</label>
            <input
              id="age"
              type="number"
              min="16"
              max="100"
              value={profile.age || 0}
              onChange={e => setProfile({ ...profile, age: parseInt(e.target.value) })}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="height">Height (cm)</label>
            <input
              id="height"
              type="number"
              min="100"
              max="220"
              value={profile.height || 0}
              onChange={e => setProfile({ ...profile, height: parseInt(e.target.value) })}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight"
              type="number"
              min="30"
              max="200"
              step="0.1"
              value={profile.weight || 0}
              onChange={e => setProfile({ ...profile, weight: parseFloat(e.target.value) })}
              required
              disabled={loading}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3>Training Constraints</h3>
        <p className={styles.hint}>These details shape session timing and workout targets without changing the high-level goal.</p>

        <div className={styles.grid}>
          <div className={styles.group}>
            <label htmlFor="ftp">Current FTP (watts) - optional</label>
            <input
              id="ftp"
              type="number"
              min="50"
              max="500"
              value={profile.ftp || ''}
              onChange={e => setProfile({ ...profile, ftp: parseInt(e.target.value, 10) || undefined })}
              disabled={loading}
              placeholder="e.g. 250"
            />
          </div>
        </div>

        <h3>Available Training Time</h3>
        <div className={styles.timeGrid}>
          {Object.entries(profile.availableTime || {}).map(([day, hours]) => (
            <div key={day} className={styles.timeGroup}>
              <label htmlFor={`time-${day}`}>{day.charAt(0).toUpperCase() + day.slice(1)}</label>
              <input
                id={`time-${day}`}
                type="number"
                min="0"
                max="8"
                step="0.5"
                value={hours || 0}
                onChange={e =>
                  setProfile({
                    ...profile,
                    availableTime: {
                      ...profile.availableTime,
                      [day]: parseFloat(e.target.value),
                    },
                  })
                }
                disabled={loading}
              />
              <span>hrs</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Equipment Available</h3>
        <div className={styles.equipmentGrid}>
          {EQUIPMENT_OPTIONS.map(equipment => (
            <button
              key={equipment.id}
              type="button"
              className={clsx(styles.equipmentButton, {
                [styles.selected]: profile.equipment?.includes(equipment.id),
              })}
              onClick={() => toggleEquipment(equipment.id)}
              disabled={loading}
            >
              <span className={styles.icon}>{equipment.icon}</span>
              <span>{equipment.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Current Injuries or Issues</h3>
        <div className={styles.injuriesGrid}>
          {INJURIES.map(injury => (
            <button
              key={injury.id}
              type="button"
              className={clsx(styles.injuryButton, {
                [styles.selected]: profile.injuries?.includes(injury.id),
              })}
              onClick={() => toggleInjury(injury.id)}
              disabled={loading}
            >
              {injury.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>⚡ Power Meter & Performance Data</h3>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={profile.hasPowerMeter || false}
            onChange={e => setProfile({ ...profile, hasPowerMeter: e.target.checked })}
            disabled={loading}
          />
          <span>I have a power meter on my bike</span>
        </label>
        <p className={styles.hint}>
          {profile.hasPowerMeter
            ? 'Your training zones will be based on power output (watts) and synced with Intervals.icu ride data.'
            : 'Your training zones will be based on heart rate only. Add a power meter later to optimize training intensity.'}
        </p>
      </div>
      </>
      )}

      </details>

      <button type="submit" className={styles.submitButton} disabled={loading}>
        {loading ? 'Saving...' : submitLabel}
      </button>
    </form>
  )
}

function mergeWithDefaultProfile(initialProfile?: Partial<UserProfile>): Partial<UserProfile> {
  const today = new Date()
  const defaultPlanStartDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const defaultAvailableTime = {
    monday: 1,
    tuesday: 1.5,
    wednesday: 1,
    thursday: 1.5,
    friday: 1,
    saturday: 2.5,
    sunday: 1.5,
  }

  return {
    planName: 'My Training Plan',
    age: 35,
    height: 180,
    weight: 75,
    goal: 'ftp_increase',
    planStartDate: defaultPlanStartDate,
    desiredPlanWeeks: 12,
    intensityDistribution: 'conservative',
    qualityPriority: 'balanced',
    hardSessionsPerWeekCap: 2,
    shortDayPreference: 'mixed',
    dietPreference: 'mediterranean',
    dailyCalorieTarget: undefined,
    dailyProteinTargetGrams: undefined,
    dailyCarbTargetGrams: undefined,
    dailyFatTargetGrams: undefined,
    ftpIncreaseTargetWatts: 0,
    equipment: [],
    injuries: [],
    hasPowerMeter: false,
    plannedEvents: [],
    ...initialProfile,
    availableTime: {
      ...defaultAvailableTime,
      ...initialProfile?.availableTime,
    },
  }
}
