'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { DailyReadinessEntry, EventPriority, SessionCompletion, TrainingPlan, TrainingSession, UserProfile, UserZoneProfile } from '@/app/lib/types'
import type { RideMatchMap } from '@/app/lib/rideMatcher'
import { estimateTSSFromRide } from '@/app/lib/rideMatcher'
import styles from './TrainingCalendar.module.scss'

/**
 * Props for TrainingCalendar component
 */
interface TrainingCalendarProps {
  plan: TrainingPlan
  onSessionChange?: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  onSessionMove?: (source: { weekNumber: number; dayOfWeek: number }, target: { weekNumber: number; dayOfWeek: number }) => void
  onSessionEdit?: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  onSessionView?: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  onSessionLog?: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  completions?: Map<string, SessionCompletion>
  zoneProfile?: UserZoneProfile
  matchedRides?: RideMatchMap
  readinessEntry?: DailyReadinessEntry
  editable?: boolean
  changedSessions?: Set<string>
  highlightSession?: (session: TrainingSession) => boolean
  highlightEnabled?: boolean
  highlightPulseToken?: number
  fatigueRiskByDate?: Record<string, 'none' | 'watch' | 'risk'>
  fatigueDetailsByDate?: Record<
    string,
    {
      tsb: number
      ramp7d: number
      plannedStress: number
      completedStress: number
      risk: 'none' | 'watch' | 'risk'
    }
  >
  plannedEvents?: UserProfile['plannedEvents']
  autoScrollToTodaySignal?: number
}

const WEEK_LENGTH_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const READINESS_NOTE_PREVIEW_LIMIT = 72
const SESSION_TYPE_ICONS: Record<string, string> = {
  endurance: '🛣️',
  tempo: '🚴',
  threshold: '⚡',
  vo2max: '🔥',
  anaerobic: '💪',
  strength: '🏋️',
  recovery: '☁️',
}

type SessionModality = 'Bike' | 'Rower' | 'Strength'

function getSessionModality(session: TrainingSession): SessionModality {
  if (session.type === 'strength') {
    return 'Strength'
  }

  if (session.equipment.includes('rowing_machine') && !session.equipment.includes('indoor_trainer')) {
    return 'Rower'
  }

  return 'Bike'
}

function getWorkoutLevel(session: TrainingSession): number | null {
  const descriptionMatch = session.description.match(/\(L(\d+(?:\.\d+)?)\)/i)
  if (descriptionMatch) {
    return Number(descriptionMatch[1])
  }

  const structuredLead = session.structuredWorkout?.[0]
  if (structuredLead) {
    const structuredMatch = structuredLead.match(/Workout Level\s+(\d+(?:\.\d+)?)/i)
    if (structuredMatch) {
      return Number(structuredMatch[1])
    }
  }

  return null
}

function getSessionSubtype(session: TrainingSession): string | null {
  const title = session.description.replace(/\s*\(L\d+(?:\.\d+)?\)\s*$/i, '').trim()

  const knownSubtypes = [
    'FTP Baseline Test',
    'FTP Progress Assessment',
    'Threshold Over-Under',
    'Threshold Cruise',
    'Lactate Threshold 40/20',
    'Supra-Threshold Power',
    'VO2 30/15 Micro Intervals',
    'VO2 Microbursts',
    'VO2 Long Repeats',
    'VO2 40/20',
    'Anaerobic Sprints',
    'Anaerobic 30/30',
    'Race Acceleration Power',
    'Tempo Cadence Blocks',
    'Tempo Low-Cadence Torque',
    'Endurance with Surges',
    'Split Endurance',
    'Endurance + Low-Cadence',
    'Strength Posterior Chain',
    'Strength Max Force',
    'Strength Power + Conditioning',
    'Strength Band Power',
  ]

  const matched = knownSubtypes.find((subtype) => title.includes(subtype))
  if (matched) {
    return matched
  }

  return null
}

function getWeekColumns(): Array<{ dayOfWeek: number; weekdayLabel: string }> {
  const mondayReference = new Date(2024, 0, 1)
  return Array.from({ length: WEEK_LENGTH_DAYS }, (_, index) => {
    const dayOfWeek = index + 1
    const date = new Date(mondayReference)
    date.setDate(mondayReference.getDate() + index)

    return {
      dayOfWeek,
      weekdayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
    }
  })
}

type CalendarWeekRow = {
  key: string
  year: number
  weekNumber: number
  startDate: Date
  endDate: Date
  cells: Array<{
    date: Date
    dateKey: string
    sourceWeekNumber: number | null
    sourceDayOfWeek: number | null
    session: TrainingSession | null
    isInPlanRange: boolean
  }>
}

function normalizeDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function startOfIsoWeek(date: Date): Date {
  const normalized = normalizeDateOnly(date)
  const day = normalized.getDay() || 7
  const result = new Date(normalized)
  result.setDate(normalized.getDate() - (day - 1))
  return result
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getIsoWeekInfo(date: Date): { year: number; weekNumber: number } {
  const normalized = normalizeDateOnly(date)
  const day = normalized.getDay() || 7
  const thursday = new Date(normalized)
  thursday.setDate(normalized.getDate() + (4 - day))

  const isoYear = thursday.getFullYear()
  const yearStart = new Date(isoYear, 0, 1)
  const yearStartDay = yearStart.getDay() || 7
  const firstThursday = new Date(yearStart)
  firstThursday.setDate(yearStart.getDate() + (4 - yearStartDay))

  const weekNumber = 1 + Math.floor((normalizeDateOnly(thursday).getTime() - normalizeDateOnly(firstThursday).getTime()) / (7 * MS_PER_DAY))
  return { year: isoYear, weekNumber }
}

function getPlanCoordinatesForDate(planStartDate: Date, date: Date, totalWeeks: number): { weekNumber: number; dayOfWeek: number } | null {
  const start = normalizeDateOnly(planStartDate)
  const target = normalizeDateOnly(date)
  const dayOffset = Math.floor((target.getTime() - start.getTime()) / MS_PER_DAY)

  if (dayOffset < 0 || dayOffset >= totalWeeks * WEEK_LENGTH_DAYS) {
    return null
  }

  return {
    weekNumber: Math.floor(dayOffset / WEEK_LENGTH_DAYS) + 1,
    dayOfWeek: (dayOffset % WEEK_LENGTH_DAYS) + 1,
  }
}

function buildCalendarWeekRows(plan: TrainingPlan): CalendarWeekRow[] {
  const sessionByDate = new Map<
    string,
    {
      session: TrainingSession
      sourceWeekNumber: number
      sourceDayOfWeek: number
    }
  >()

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const parsedDate = toDate(session.date)
      const dateKey = formatDateKey(parsedDate)
      sessionByDate.set(dateKey, {
        session,
        sourceWeekNumber: week.weekNumber,
        sourceDayOfWeek: session.dayOfWeek,
      })
    }
  }

  const planStart = normalizeDateOnly(new Date(plan.startDate))
  const planEnd = new Date(planStart)
  planEnd.setDate(planStart.getDate() + plan.durationWeeks * WEEK_LENGTH_DAYS - 1)

  const firstWeekStart = startOfIsoWeek(planStart)
  const lastWeekStart = startOfIsoWeek(planEnd)

  const rows: CalendarWeekRow[] = []
  for (let weekStartMs = firstWeekStart.getTime(); weekStartMs <= lastWeekStart.getTime(); weekStartMs += WEEK_LENGTH_DAYS * MS_PER_DAY) {
    const startDate = new Date(weekStartMs)
    const endDate = new Date(weekStartMs)
    endDate.setDate(startDate.getDate() + WEEK_LENGTH_DAYS - 1)
    const weekInfo = getIsoWeekInfo(startDate)

    const cells = Array.from({ length: WEEK_LENGTH_DAYS }, (_, dayIndex) => {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + dayIndex)
      const dateKey = formatDateKey(date)
      const source = sessionByDate.get(dateKey)
      const isInPlanRange = date.getTime() >= planStart.getTime() && date.getTime() <= planEnd.getTime()
      const derivedCoordinates = source ? null : getPlanCoordinatesForDate(planStart, date, plan.durationWeeks)

      return {
        date,
        dateKey,
        sourceWeekNumber: source?.sourceWeekNumber ?? derivedCoordinates?.weekNumber ?? null,
        sourceDayOfWeek: source?.sourceDayOfWeek ?? derivedCoordinates?.dayOfWeek ?? null,
        session: source?.session ?? null,
        isInPlanRange,
      }
    })

    rows.push({
      key: `${weekInfo.year}-${weekInfo.weekNumber}`,
      year: weekInfo.year,
      weekNumber: weekInfo.weekNumber,
      startDate,
      endDate,
      cells,
    })
  }

  return rows
}

function getPlanWeekLabelForRow(cells: CalendarWeekRow['cells']): string {
  const planWeeks = [...new Set(cells.map((cell) => cell.sourceWeekNumber).filter((value): value is number => typeof value === 'number'))].sort(
    (left, right) => left - right
  )

  if (planWeeks.length === 0) {
    return 'Outside plan range'
  }

  if (planWeeks.length === 1) {
    return `Plan W${planWeeks[0]}`
  }

  return `Plan W${planWeeks[0]}-W${planWeeks[planWeeks.length - 1]}`
}

/**
 * Editable training calendar with week view
 */
export default function TrainingCalendar({
  plan,
  onSessionChange,
  onSessionMove,
  onSessionEdit,
  onSessionView,
  onSessionLog,
  completions = new Map(),
  zoneProfile,
  matchedRides = new Map(),
  readinessEntry,
  editable = true,
  changedSessions = new Set(),
  highlightSession,
  highlightEnabled = false,
  highlightPulseToken = 0,
  fatigueRiskByDate = {},
  fatigueDetailsByDate = {},
  plannedEvents = [],
  autoScrollToTodaySignal = 0,
}: TrainingCalendarProps) {
  const weekColumns = getWeekColumns()
  const calendarWeekRows = buildCalendarWeekRows(plan)
  const todayDateKey = formatDateKey(new Date())
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)
  const todayCellRef = useRef<HTMLTableCellElement | null>(null)
  const lastAutoScrollKeyRef = useRef<string | null>(null)
  const [draggedSession, setDraggedSession] = useState<{
    weekNumber: number
    dayOfWeek: number
    session: TrainingSession
  } | null>(null)
  const [editingDurationKey, setEditingDurationKey] = useState<string | null>(null)
  const [durationDraft, setDurationDraft] = useState('')
  const [editingIntensityKey, setEditingIntensityKey] = useState<string | null>(null)
  const [isHighlightPulseActive, setIsHighlightPulseActive] = useState(false)
  const [expandedFatigueSessionKey, setExpandedFatigueSessionKey] = useState<string | null>(null)
  const hasTodayInCalendar = calendarWeekRows.some((week) => week.cells.some((cell) => cell.dateKey === todayDateKey))

  useEffect(() => {
    if (!editable) {
      setEditingDurationKey(null)
      setDurationDraft('')
      setEditingIntensityKey(null)
    }
  }, [editable])

  useEffect(() => {
    if (!highlightEnabled || highlightPulseToken <= 0) {
      return
    }

    setIsHighlightPulseActive(true)
    const timeoutId = window.setTimeout(() => {
      setIsHighlightPulseActive(false)
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [highlightEnabled, highlightPulseToken])

  useEffect(() => {
    if (!hasTodayInCalendar || !calendarScrollRef.current || !todayCellRef.current) {
      return
    }

    const autoScrollKey = `${plan.id}-${todayDateKey}-${autoScrollToTodaySignal}`
    if (lastAutoScrollKeyRef.current === autoScrollKey) {
      return
    }

    const scrollContainer = calendarScrollRef.current
    const todayCell = todayCellRef.current

    window.requestAnimationFrame(() => {
      const containerRect = scrollContainer.getBoundingClientRect()
      const cellRect = todayCell.getBoundingClientRect()

      const topOffset = cellRect.top - containerRect.top
      const leftOffset = cellRect.left - containerRect.left

      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + topOffset - containerRect.height * 0.25,
        left: scrollContainer.scrollLeft + leftOffset - containerRect.width * 0.25,
        behavior: 'smooth',
      })
    })

    lastAutoScrollKeyRef.current = autoScrollKey
  }, [autoScrollToTodaySignal, hasTodayInCalendar, plan.id, todayDateKey])

  /**
   * Handle drag start
   */
  const handleDragStart = (event: React.DragEvent, weekNumber: number, dayOfWeek: number, session: TrainingSession) => {
    if (!editable) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', session.id)
    setDraggedSession({ weekNumber, dayOfWeek, session })
  }

  /**
   * Handle drag over
   */
  const handleDragOver = (e: React.DragEvent) => {
    if (!editable) return
    e.preventDefault()
    e.currentTarget.classList.add(styles.dragOver)
  }

  /**
   * Handle drag leave
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove(styles.dragOver)
  }

  /**
   * Handle drop (reschedule session)
   */
  const handleDrop = (e: React.DragEvent, targetWeek: number | null, targetDayOfWeek: number | null) => {
    if (!editable || !draggedSession) return
    if (!targetWeek || !targetDayOfWeek) return

    e.preventDefault()
    e.currentTarget.classList.remove(styles.dragOver)

    const { session, weekNumber, dayOfWeek } = draggedSession

    // If moving to same position, do nothing
    if (weekNumber === targetWeek && dayOfWeek === targetDayOfWeek) {
      setDraggedSession(null)
      return
    }

    if (onSessionMove) {
      onSessionMove(
        { weekNumber, dayOfWeek },
        { weekNumber: targetWeek, dayOfWeek: targetDayOfWeek }
      )
      setDraggedSession(null)
      return
    }

    if (!onSessionChange) {
      setDraggedSession(null)
      return
    }

    // Create new session with updated date
    const targetDate = new Date(plan.startDate)
    targetDate.setDate(targetDate.getDate() + (targetWeek - 1) * 7 + (targetDayOfWeek - 1))

    const updatedSession: TrainingSession = {
      ...session,
      date: targetDate,
      dayOfWeek: targetDayOfWeek,
    }

    onSessionChange(targetWeek, targetDayOfWeek, updatedSession)
    setDraggedSession(null)
  }

  /**
   * Handle duration inline edit
   */
  const handleDurationChange = (weekNumber: number, dayOfWeek: number, session: TrainingSession, newDuration: string) => {
    if (!editable || !onSessionChange) return

    const duration = parseInt(newDuration, 10)
    if (isNaN(duration) || duration < 0) return

    const updatedSession = { ...session, duration }
    onSessionChange(weekNumber, dayOfWeek, updatedSession)
    setEditingDurationKey(null)
    setDurationDraft('')
  }

  /**
   * Handle intensity inline edit
   */
  const handleIntensityChange = (weekNumber: number, dayOfWeek: number, session: TrainingSession, newIntensity: string) => {
    if (!editable || !onSessionChange) return

    const updatedSession = {
      ...session,
      intensity: newIntensity as 'easy' | 'moderate' | 'hard' | 'very_hard',
    }
    onSessionChange(weekNumber, dayOfWeek, updatedSession)
    setEditingIntensityKey(null)
  }

  /**
   * Get intensity color
   */
  const getIntensityColor = (intensity: string): string => {
    const colors: Record<string, string> = {
      easy: '#90ee90',
      moderate: '#ffd700',
      hard: '#ff8c00',
      very_hard: '#ff4500',
    }
    return colors[intensity] || '#888'
  }

  const isRestDay = (session: TrainingSession | null): boolean => {
    if (!session) return true
    return session.type === 'recovery' && session.duration === 0
  }

  const getSessionForDay = (weekSessions: TrainingSession[], dayOfWeek: number): TrainingSession | null => {
    return weekSessions.find((session) => session.dayOfWeek === dayOfWeek) || null
  }

  // Compute TSS estimate from planned stress or duration + intensity proxy
  const getSessionTSS = (session: TrainingSession): number | null => {
    if (session.plannedStress && session.plannedStress > 0) return Math.round(session.plannedStress)
    if (isRestDay(session)) return null
    const intensityFactor: Record<string, number> = { easy: 0.65, moderate: 0.78, hard: 0.9, very_hard: 1.0 }
    const IF = intensityFactor[session.intensity] || 0.75
    const hours = session.duration / 60
    const tss = Math.round(hours * IF * IF * 100)
    return tss > 0 ? tss : null
  }

  const getSessionIF = (session: TrainingSession): number | null => {
    if (isRestDay(session)) return null
    if (session.plannedPower && zoneProfile?.ftp) return Math.round((session.plannedPower / zoneProfile.ftp) * 100) / 100
    const intensityFactor: Record<string, number> = { easy: 0.65, moderate: 0.78, hard: 0.9, very_hard: 1.0 }
    return intensityFactor[session.intensity] ?? null
  }

  // Per-week compliance helpers
  const getWeekCompliance = (cells: (typeof calendarWeekRows)[0]['cells']): { done: number; total: number; pct: number } => {
    const trainableSessions = cells.filter((c) => c.session && !isRestDay(c.session))
    const total = trainableSessions.length
    const done = trainableSessions.filter((c) => {
      const comp = c.session ? completions.get(c.session.id) : undefined
      return comp?.status === 'completed' || comp?.status === 'partial'
    }).length
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }

  return (
    <div className={styles.calendarContainer}>
      {editable && <p className={styles.calendarHint}>Drag to reschedule • Double-click duration/intensity for quick edits • Use ✏️ for full editor</p>}

      <div className={styles.calendarScroll} ref={calendarScrollRef}>
        <table className={styles.calendar}>
          <thead>
            <tr>
              <th className={styles.weekCol}>Week</th>
              {weekColumns.map((column) => (
                <th key={column.dayOfWeek} className={styles.dayCol}>
                  {column.weekdayLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendarWeekRows.map((calendarWeek) => {
              const compliance = getWeekCompliance(calendarWeek.cells)
              return (
              <tr key={calendarWeek.key} className={styles.weekRow}>
                <td className={styles.weekCol}>
                  <div className={styles.weekLabel}>
                    <span className={styles.weekNum}>CW{calendarWeek.weekNumber}</span>
                    <span className={styles.weekRange}>
                      {calendarWeek.startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' - '}
                      {calendarWeek.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className={styles.weekRange}>{getPlanWeekLabelForRow(calendarWeek.cells)}</span>
                    <span className={styles.weekRange}>Y{calendarWeek.year}</span>
                    {compliance.total > 0 && (
                      <span
                        className={clsx(
                          styles.compliancePill,
                          compliance.pct === 100 && styles.compliancePerfect,
                          compliance.pct >= 50 && compliance.pct < 100 && styles.compliancePartial,
                          compliance.pct < 50 && styles.complianceLow,
                        )}
                        title={`${compliance.done} of ${compliance.total} sessions logged`}
                      >
                        {compliance.done}/{compliance.total} · {compliance.pct}%
                      </span>
                    )}
                  </div>
                </td>

                {calendarWeek.cells.map((cell) => {
                  const dayOfWeek = cell.sourceDayOfWeek
                  const weekNumber = cell.sourceWeekNumber
                  const existingSession = cell.session
                  const session =
                    existingSession ||
                    ({
                      id: `placeholder_${cell.dateKey}`,
                      date: cell.date,
                      dayOfWeek: dayOfWeek || 1,
                      type: 'recovery',
                      duration: 0,
                      intensity: 'easy',
                      description: 'Rest Day',
                      focus: [],
                      equipment: [],
                      notes: 'Rest day',
                    } as TrainingSession)

                  const isPlaceholder = !existingSession
                  const canEditCell = editable && Boolean(weekNumber && dayOfWeek) && cell.isInPlanRange
                  const canViewCell = Boolean(onSessionView && weekNumber && dayOfWeek && !isPlaceholder)
                  const isRest = isRestDay(existingSession)
                  const sessionKey = weekNumber && dayOfWeek ? `${weekNumber}-${dayOfWeek}` : `na-${cell.dateKey}`
                  const isChanged = changedSessions.has(sessionKey)
                  const isHighlighted = highlightEnabled && highlightSession ? highlightSession(session) : false
                  const isDimmed = highlightEnabled && !isHighlighted
                  const calendarDate = existingSession?.date ? new Date(existingSession.date) : cell.date
                  const isToday = cell.dateKey === todayDateKey
                  const readinessSummary = isToday ? summarizeReadiness(readinessEntry) : null
                  const readinessNote = isToday ? readinessEntry?.notes?.trim() : undefined
                  const readinessNotePreview = readinessNote
                    ? readinessNote.length > READINESS_NOTE_PREVIEW_LIMIT
                      ? `${readinessNote.slice(0, READINESS_NOTE_PREVIEW_LIMIT - 1)}...`
                      : readinessNote
                    : undefined
                  const hasTrimmedReadinessNote = Boolean(readinessNote && readinessNotePreview && readinessNotePreview !== readinessNote)
                  const modality = getSessionModality(session)
                  const workoutLevel = getWorkoutLevel(session)
                  const sessionSubtype = getSessionSubtype(session)
                  const modalityClass =
                    modality === 'Strength'
                      ? styles.modalityStrength
                      : modality === 'Rower'
                        ? styles.modalityRower
                        : styles.modalityBike
                  const fatigueRisk = fatigueRiskByDate[formatDateKey(calendarDate)] || 'none'
                  const fatigueDetail = fatigueDetailsByDate[formatDateKey(calendarDate)]
                  const isFatigueExpanded = expandedFatigueSessionKey === sessionKey
                  const dateKey = formatDateKey(calendarDate)
                  const dayEvents = (plannedEvents || []).filter((event) => event.date === dateKey)
                  const getPriorityClass = (priority: EventPriority): string => {
                    if (priority === 'A') return styles.eventBadgeA
                    if (priority === 'B') return styles.eventBadgeB
                    return styles.eventBadgeC
                  }

                  return (
                    <td
                      key={cell.dateKey}
                      ref={isToday ? todayCellRef : undefined}
                      className={clsx(
                        styles.sessionCell,
                        isChanged && styles.changed,
                        isRest && styles.restCell,
                        isToday && styles.todayCell,
                        isHighlighted && styles.highlighted,
                        isDimmed && styles.dimmed,
                        isHighlighted && isHighlightPulseActive && styles.highlightPulse
                      )}
                      draggable={canEditCell && !isPlaceholder && !isRest}
                      onDragStart={(event) => {
                        if (!weekNumber || !dayOfWeek) {
                          return
                        }
                        handleDragStart(event, weekNumber, dayOfWeek, session)
                      }}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, weekNumber, dayOfWeek)}
                      onClick={() => {
                        if (!editable && canViewCell && weekNumber && dayOfWeek && existingSession && onSessionView) {
                          onSessionView(weekNumber, dayOfWeek, existingSession)
                        }
                      }}
                    >
                      <div className={clsx(styles.sessionCard, isRest && styles.restCard)}>
                        <div className={clsx(styles.dateBadge, isToday && styles.todayDateBadge)}>
                          <span className={styles.dateDay}>{calendarDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <span className={styles.dateValue}>{calendarDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          {readinessSummary && (
                            <span className={clsx(styles.readinessPill, styles[`readiness${readinessSummary.tone[0].toUpperCase()}${readinessSummary.tone.slice(1)}`])}>
                              {readinessSummary.label}
                            </span>
                          )}
                          {isToday && <span className={styles.todayPill}>Today</span>}
                        </div>

                        {readinessNotePreview && (
                          <p className={styles.readinessNote} title={hasTrimmedReadinessNote ? readinessNote : undefined}>
                            Note: {readinessNotePreview}
                          </p>
                        )}

                        {dayEvents.length > 0 && (
                          <div className={styles.eventBadges}>
                            {dayEvents.map((event) => (
                              <span
                                key={event.id}
                                className={clsx(styles.eventBadge, getPriorityClass(event.priority))}
                                title={`${event.priority}-priority event: ${event.name}`}
                              >
                                {event.priority}: {event.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className={styles.sessionHeader}>
                          <span className={styles.icon}>{isRest ? '🛌' : SESSION_TYPE_ICONS[session.type] || '🚴'}</span>
                          <span className={styles.type}>{isRest ? 'rest' : session.type}</span>
                          {!isRest && workoutLevel !== null && (
                            <span className={styles.levelBadge} title="Workout progression level">
                              L{workoutLevel.toFixed(1)}
                            </span>
                          )}
                          {!isRest && sessionSubtype && (
                            <span className={styles.subtypeBadge} title="Workout subtype">
                              {sessionSubtype}
                            </span>
                          )}
                          {!isRest && (
                            <span className={clsx(styles.modalityBadge, modalityClass)} title="Detected training modality">
                              {modality}
                            </span>
                          )}
                          {!isRest && session.zoneVersionLabel && (
                            <span
                              className={styles.zoneVersionBadge}
                              title={`Interval targets locked to zone version ${session.zoneVersionLabel}${session.zoneVersionFtp ? ` (${session.zoneVersionFtp}W FTP)` : ''}`}
                            >
                              {session.zoneVersionLabel}
                            </span>
                          )}
                          {!isRest && session.preDayNutritionTip && (
                            <span
                              className={styles.nutritionBadge}
                              title={`Night before: ${session.preDayNutritionTip}`}
                            >
                              🥗 Pre-day fuel
                            </span>
                          )}
                          {!isRest && fatigueRisk !== 'none' && (
                            <button
                              type="button"
                              className={clsx(styles.fatigueBadge, fatigueRisk === 'risk' ? styles.fatigueBadgeRisk : styles.fatigueBadgeWatch)}
                              onClick={() => setExpandedFatigueSessionKey((current) => (current === sessionKey ? null : sessionKey))}
                              aria-expanded={isFatigueExpanded}
                              aria-controls={`fatigue-detail-${sessionKey}`}
                              title={
                                fatigueRisk === 'risk'
                                  ? 'High fatigue risk forecast for this date. Tap to see details.'
                                  : 'Moderate fatigue risk forecast. Tap to see details.'
                              }
                            >
                              {fatigueRisk === 'risk' ? 'Fatigue Risk' : 'Fatigue Watch'} {isFatigueExpanded ? '▾' : '▸'}
                            </button>
                          )}
                        </div>

                        {!isRest && fatigueRisk !== 'none' && fatigueDetail && isFatigueExpanded && (
                          <div id={`fatigue-detail-${sessionKey}`} className={styles.fatigueDetailsPanel}>
                            <div>
                              TSB: <strong>{fatigueDetail.tsb.toFixed(1)}</strong>
                            </div>
                            <div>
                              Ramp (7d): <strong>{fatigueDetail.ramp7d.toFixed(1)}</strong>
                            </div>
                            <div>
                              Planned Stress: <strong>{fatigueDetail.plannedStress.toFixed(1)}</strong>
                            </div>
                            <div>
                              Completed Stress: <strong>{fatigueDetail.completedStress.toFixed(1)}</strong>
                            </div>
                          </div>
                        )}

                        <div className={styles.sessionBody}>
                          {editingDurationKey === sessionKey && !isRest ? (
                            <input
                              type="number"
                              min="0"
                              value={durationDraft}
                              onChange={(e) => setDurationDraft(e.target.value)}
                              onBlur={() => {
                                const duration = parseInt(durationDraft || '0', 10)
                                if (duration >= 0 && weekNumber && dayOfWeek) {
                                  handleDurationChange(weekNumber, dayOfWeek, session, duration.toString())
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const duration = parseInt(durationDraft || '0', 10)
                                  if (duration >= 0 && weekNumber && dayOfWeek) {
                                    handleDurationChange(weekNumber, dayOfWeek, session, duration.toString())
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingDurationKey(null)
                                  setDurationDraft('')
                                }
                              }}
                              autoFocus
                              className={styles.inlineInput}
                            />
                          ) : (
                            <div
                              className={styles.duration}
                              onDoubleClick={() => {
                                if (!canEditCell || isRest) {
                                  return
                                }

                                  setEditingDurationKey(sessionKey)
                                  setDurationDraft(String(session.duration))
                              }}
                              title={editable ? 'Double-click for quick duration edit' : undefined}
                            >
                              {isRest ? '🛌 Rest day' : `⏱️ ${session.duration} min`}
                            </div>
                          )}

                          {editingIntensityKey === sessionKey && !isRest ? (
                            <select
                              value={session.intensity}
                              onChange={(e) => {
                                if (!weekNumber || !dayOfWeek) {
                                  return
                                }
                                handleIntensityChange(
                                  weekNumber,
                                  dayOfWeek,
                                  session,
                                  e.target.value
                                )
                              }}
                              onBlur={() => setEditingIntensityKey(null)}
                              autoFocus
                              className={styles.inlineSelect}
                            >
                              <option value="easy">Easy</option>
                              <option value="moderate">Moderate</option>
                              <option value="hard">Hard</option>
                              <option value="very_hard">Very Hard</option>
                            </select>
                          ) : (
                            <div
                              className={styles.intensity}
                              style={{ backgroundColor: getIntensityColor(session.intensity) + '20' }}
                              onDoubleClick={() => {
                                if (!canEditCell || isRest) {
                                  return
                                }

                                setEditingIntensityKey(sessionKey)
                              }}
                              title={editable ? 'Double-click for quick intensity edit' : undefined}
                            >
                              <span
                                className={styles.intensityBadge}
                                style={{ backgroundColor: getIntensityColor(session.intensity) }}
                              >
                                {session.intensity}
                              </span>
                            </div>
                          )}

                          {/* Power display */}
                          {!isRest && session.plannedPower && (
                            <div className={styles.power}>
                              ⚡ {session.plannedPower}W
                            </div>
                          )}

                          {/* TSS / IF line + actual vs planned overlay */}
                          {!isRest && (() => {
                            const tss = getSessionTSS(session)
                            const IF = getSessionIF(session)
                            const completion = completions.get(session.id)

                            const sessionKey2 = (() => {
                              const d = existingSession?.date ? new Date(existingSession.date) : cell.date
                              const y = d.getFullYear()
                              const mo = String(d.getMonth() + 1).padStart(2, '0')
                              const dy = String(d.getDate()).padStart(2, '0')
                              return `${y}-${mo}-${dy}`
                            })()
                            const rideMatch = matchedRides.get(sessionKey2)
                            const actualTSS = rideMatch
                              ? estimateTSSFromRide(rideMatch.ride, zoneProfile?.ftp)
                              : null

                            return (
                              <>
                                {(tss || IF) && (
                                  <div className={styles.tssRow}>
                                    {tss && (
                                      <span
                                        className={styles.tssBadge}
                                        title="Planned TSS estimate"
                                      >
                                        TSS {tss}
                                        {actualTSS != null && (
                                          <span className={clsx(
                                            styles.tssActual,
                                            actualTSS >= tss * 0.9 ? styles.tssActualGood : styles.tssActualLow,
                                          )}>
                                            {' '}→ {actualTSS}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {IF && <span className={styles.ifBadge}>IF {IF.toFixed(2)}</span>}
                                  </div>
                                )}

                                {/* Actual ride row */}
                                {rideMatch && (
                                  <div className={styles.actualRideRow}>
                                    <span className={styles.actualRideLabel}>Actual</span>
                                    <span className={styles.actualRideChip}>
                                      ⏱ {rideMatch.ride.duration} min
                                    </span>
                                    {rideMatch.ride.normalizedPower || rideMatch.ride.avgPower ? (
                                      <span className={styles.actualRideChip}>
                                        ⚡ {rideMatch.ride.normalizedPower ?? rideMatch.ride.avgPower}W
                                      </span>
                                    ) : null}
                                    {rideMatch.dayOffset !== 0 && (
                                      <span className={styles.actualRideOffset} title="Ride date offset from planned date">
                                        {rideMatch.dayOffset > 0 ? `+${rideMatch.dayOffset}d` : `${rideMatch.dayOffset}d`}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {completion && (
                                  <div className={clsx(
                                    styles.completionBadge,
                                    completion.status === 'completed' && styles.completionDone,
                                    completion.status === 'partial' && styles.completionPartial,
                                    completion.status === 'skipped' && styles.completionSkipped,
                                  )}>
                                    {completion.status === 'completed' ? '✅' : completion.status === 'partial' ? '⚡' : '🚫'}
                                    {' '}{completion.rpe ? `RPE ${completion.rpe}` : completion.status}
                                  </div>
                                )}
                              </>
                            )
                          })()}

                          {/* Focus points */}
                          {!isRest && session.focus.length > 0 && (
                            <div className={styles.focus}>
                              {session.focus.slice(0, 2).map((f) => (
                                <span key={f} className={styles.focusTag}>
                                  {f}
                                </span>
                              ))}
                              {session.focus.length > 2 && (
                                <span className={styles.focusTag}>+{session.focus.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Log session button */}
                        {!isPlaceholder && !isRest && weekNumber && dayOfWeek && onSessionLog && existingSession && (
                          <button
                            className={styles.logBtn}
                            onClick={(event) => {
                              event.stopPropagation()
                              onSessionLog(weekNumber, dayOfWeek, existingSession)
                            }}
                            title="Log session / RPE"
                          >
                            {completions.get(existingSession.id) ? '📝' : '○'}
                          </button>
                        )}

                        {/* Edit button */}
                        {canEditCell && onSessionEdit && !isPlaceholder && weekNumber && dayOfWeek && (
                          <button
                            className={styles.editBtn}
                            onClick={() => onSessionEdit(weekNumber, dayOfWeek, session)}
                            title="Open full editor"
                          >
                            ✏️
                          </button>
                        )}
                        {canViewCell && onSessionView && weekNumber && dayOfWeek && existingSession && (
                          <button
                            className={styles.viewBtn}
                            onClick={(event) => {
                              event.stopPropagation()
                              onSessionView(weekNumber, dayOfWeek, existingSession)
                            }}
                            title="View session details"
                          >
                            👁️
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendIcon}>🎯</span>
          Drag to reschedule
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendIcon}>✏️</span>
          Click to edit full session
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendIcon}>✨</span>
          Orange border = unsaved changes
        </div>
      </div>
    </div>
  )
}


function summarizeReadiness(entry?: DailyReadinessEntry): { label: string; tone: 'good' | 'ok' | 'low' } | null {
  if (!entry) {
    return null
  }

  const score = entry.sleepQuality + (6 - entry.stressLevel) + (6 - entry.muscleSoreness)
  if (score >= 11) {
    return { label: 'Ready', tone: 'good' }
  }
  if (score >= 8) {
    return { label: 'Caution', tone: 'ok' }
  }
  return { label: 'Recover', tone: 'low' }
}
