'use client'

import type { StoredPlan } from '../lib/storage'
import type { EventPriority, TrainingPhase, UserProfile } from '../lib/types'
import styles from './SeasonPlanner.module.scss'
import { useLocale } from '../lib/i18n'

interface SeasonPlannerProps {
  storedPlans: StoredPlan[]
  currentPlanId?: string
  plannedEvents?: UserProfile['plannedEvents']
  onSelectPlan: (planId: string) => void
}

type YearSection = {
  year: number
  plans: Array<{
    id: string
    name: string
    goal: string
    startDate: Date
    endDate: Date
    durationWeeks: number
    updatedAt: number
    segments: Array<{
      startDate: Date
      endDate: Date
      phase: TrainingPhase
    }>
  }>
  events: Array<{
    id: string
    name: string
    date: string
    priority: EventPriority
  }>
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfYear(year: number): Date {
  return new Date(year, 0, 1)
}

function endOfYear(year: number): Date {
  return new Date(year, 11, 31, 23, 59, 59, 999)
}

function clipDate(date: Date, min: Date, max: Date): Date {
  if (date.getTime() < min.getTime()) return min
  if (date.getTime() > max.getTime()) return max
  return date
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
}

function pctInYear(date: Date, year: number): number {
  const yearStart = startOfYear(year)
  const yearEnd = endOfYear(year)
  const total = daysBetween(yearStart, yearEnd) || 365
  return (daysBetween(yearStart, clipDate(date, yearStart, yearEnd)) / total) * 100
}

function buildPhaseSegments(plan: StoredPlan['plan']): Array<{ startDate: Date; endDate: Date; phase: TrainingPhase }> {
  const segments: Array<{ startDate: Date; endDate: Date; phase: TrainingPhase }> = []

  for (const week of plan.weeks) {
    const weekDates = week.sessions
      .map((session) => new Date(session.date))
      .sort((left, right) => left.getTime() - right.getTime())

    if (weekDates.length === 0) {
      continue
    }

    const startDate = weekDates[0]
    const endDate = weekDates[weekDates.length - 1]
    const last = segments[segments.length - 1]

    if (last && last.phase === week.phase && daysBetween(last.endDate, startDate) <= 8) {
      last.endDate = endDate
      continue
    }

    segments.push({ startDate, endDate, phase: week.phase })
  }

  return segments
}

function buildYearSections(storedPlans: StoredPlan[], plannedEvents?: UserProfile['plannedEvents']): YearSection[] {
  const yearSet = new Set<number>()

  for (const storedPlan of storedPlans) {
    yearSet.add(new Date(storedPlan.plan.startDate).getFullYear())
    yearSet.add(new Date(storedPlan.plan.endDate).getFullYear())
  }

  for (const event of plannedEvents || []) {
    if (event.date) {
      yearSet.add(new Date(event.date).getFullYear())
    }
  }

  if (yearSet.size === 0) {
    yearSet.add(new Date().getFullYear())
  }

  return [...yearSet]
    .sort((left, right) => left - right)
    .map((year) => {
      const yearStart = startOfYear(year)
      const yearEnd = endOfYear(year)

      const plans = storedPlans
        .map((storedPlan) => {
          const plan = storedPlan.plan
          const planStart = new Date(plan.startDate)
          const planEnd = new Date(plan.endDate)
          if (planEnd.getTime() < yearStart.getTime() || planStart.getTime() > yearEnd.getTime()) {
            return null
          }

          return {
            id: storedPlan.id,
            name: plan.name,
            goal: plan.goal.replace(/_/g, ' '),
            startDate: planStart,
            endDate: planEnd,
            durationWeeks: plan.durationWeeks,
            updatedAt: storedPlan.updatedAt,
            segments: buildPhaseSegments(plan),
          }
        })
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
        .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())

      const events = (plannedEvents || [])
        .filter((event) => new Date(event.date).getFullYear() === year)
        .sort((left, right) => left.date.localeCompare(right.date))

      return { year, plans, events }
    })
}

export function SeasonPlanner({ storedPlans, currentPlanId, plannedEvents = [], onSelectPlan }: SeasonPlannerProps) {
  const { translateText } = useLocale()
  const sections = buildYearSections(storedPlans, plannedEvents)

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2>{translateText('Season Planner')}</h2>
          <p>{translateText('Review all saved plans across the year, see phase blocks at a glance, and jump directly into any plan.')}</p>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.year} className={styles.yearSection}>
          <div className={styles.yearHeader}>
            <h3>{section.year}</h3>
            <span>{section.plans.length} plans</span>
          </div>

          <div className={styles.monthGrid}>
            {MONTH_LABELS.map((label) => (
              <div key={`${section.year}-${label}`} className={styles.monthCell}>{label}</div>
            ))}
          </div>

          {section.events.length > 0 && (
            <div className={styles.eventLane}>
              {section.events.map((event) => {
                const left = pctInYear(new Date(event.date), section.year)
                return (
                  <div
                    key={event.id}
                    className={`${styles.eventMarker} ${styles[`event${event.priority}`]}`}
                    style={{ left: `${left}%` }}
                    title={`${event.priority} event · ${event.name} · ${event.date}`}
                  >
                    <span>{event.priority}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className={styles.planRows}>
            {section.plans.length === 0 ? (
              <div className={styles.emptyYear}>{translateText('No saved plans in this year.')}</div>
            ) : (
              section.plans.map((plan) => {
                const clippedStart = clipDate(plan.startDate, startOfYear(section.year), endOfYear(section.year))
                const clippedEnd = clipDate(plan.endDate, startOfYear(section.year), endOfYear(section.year))
                const left = pctInYear(clippedStart, section.year)
                const right = pctInYear(clippedEnd, section.year)
                const width = Math.max(1, right - left)

                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={`${styles.planRow} ${currentPlanId === plan.id ? styles.planRowActive : ''}`}
                    onClick={() => onSelectPlan(plan.id)}
                  >
                    <div className={styles.planMeta}>
                      <strong>{plan.name}</strong>
                      <span>{plan.goal} · {plan.durationWeeks} weeks</span>
                    </div>
                    <div className={styles.timelineTrack}>
                      <div className={styles.timelineBase} style={{ left: `${left}%`, width: `${width}%` }} />
                      {plan.segments
                        .filter((segment) => !(segment.endDate.getTime() < startOfYear(section.year).getTime() || segment.startDate.getTime() > endOfYear(section.year).getTime()))
                        .map((segment, index) => {
                          const segmentStart = clipDate(segment.startDate, startOfYear(section.year), endOfYear(section.year))
                          const segmentEnd = clipDate(segment.endDate, startOfYear(section.year), endOfYear(section.year))
                          const segmentLeft = pctInYear(segmentStart, section.year)
                          const segmentRight = pctInYear(segmentEnd, section.year)
                          const segmentWidth = Math.max(0.8, segmentRight - segmentLeft)

                          return (
                            <span
                              key={`${plan.id}-${segment.phase}-${index}`}
                              className={`${styles.phaseBar} ${styles[`phase${segment.phase.charAt(0).toUpperCase()}${segment.phase.slice(1)}`]}`}
                              style={{ left: `${segmentLeft}%`, width: `${segmentWidth}%` }}
                              title={`${segment.phase} · ${segmentStart.toLocaleDateString()} - ${segmentEnd.toLocaleDateString()}`}
                            />
                          )
                        })}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ))}

      <div className={styles.legend}>
        <span className={`${styles.legendPill} ${styles.phaseBase}`}>Base</span>
        <span className={`${styles.legendPill} ${styles.phaseBuild}`}>Build</span>
        <span className={`${styles.legendPill} ${styles.phasePeak}`}>Peak</span>
        <span className={`${styles.legendPill} ${styles.phaseRecovery}`}>Recovery</span>
        <span className={`${styles.legendPill} ${styles.eventA}`}>A Event</span>
        <span className={`${styles.legendPill} ${styles.eventB}`}>B Event</span>
        <span className={`${styles.legendPill} ${styles.eventC}`}>C Event</span>
      </div>
    </section>
  )
}
