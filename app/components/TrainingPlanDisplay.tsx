'use client'

import clsx from 'clsx'
import styles from './TrainingPlanDisplay.module.scss'
import type { TrainingPlan, TrainingWeek } from '@/app/lib/types'

interface TrainingPlanDisplayProps {
  plan: TrainingPlan
  onExportPDF?: () => void
  onExportCSV?: () => void
  onPrint?: () => void
}

export function TrainingPlanDisplay({
  plan,
  onExportPDF,
  onExportCSV,
  onPrint,
}: TrainingPlanDisplayProps) {
  const ftpGainTargetLabel =
    typeof plan.targetMetrics.ftpIncreaseTargetWatts === 'number' && plan.targetMetrics.ftpIncreaseTargetWatts > 0
      ? `Auto-assessed: +${plan.targetMetrics.ftpIncreaseTargetWatts}W`
      : 'N/A'

  const getSessionIcon = (type: string): string => {
    const icons: Record<string, string> = {
      recovery: '🧘',
      endurance: '🚴',
      tempo: '⚡',
      threshold: '🔥',
      vo2max: '💪',
      anaerobic: '🚀',
      strength: '💯',
    }
    return icons[type] || '🚴'
  }

  const getPhaseColor = (phase: string): string => {
    const colors: Record<string, string> = {
      base: '#3498db',
      build: '#f39c12',
      peak: '#e74c3c',
      recovery: '#2ecc71',
    }
    return colors[phase] || '#95a5a6'
  }

  const getWorkoutLevel = (description: string, structuredWorkout?: string[]): number | null => {
    const descriptionMatch = description.match(/\(L(\d+(?:\.\d+)?)\)/i)
    if (descriptionMatch) {
      return Number(descriptionMatch[1])
    }

    const lead = structuredWorkout?.[0]
    if (!lead) {
      return null
    }

    const structuredMatch = lead.match(/Workout Level\s+(\d+(?:\.\d+)?)/i)
    return structuredMatch ? Number(structuredMatch[1]) : null
  }

  const getSessionSubtype = (description: string): string | null => {
    const title = description.replace(/\s*\(L\d+(?:\.\d+)?\)\s*$/i, '').trim()

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

    return knownSubtypes.find((subtype) => title.includes(subtype)) || null
  }

  return (
    <div id="training-plan-display" className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1>{plan.name}</h1>
          <p className={styles.subtitle}>
            {plan.durationWeeks}-Week Plan • Goal: {plan.goal.replace('_', ' ').toUpperCase()}
          </p>
          <p className={styles.dateRange}>
            {plan.startDate.toLocaleDateString()} - {plan.endDate.toLocaleDateString()}
          </p>
        </div>

        <div className={styles.actions}>
          {onExportPDF && (
            <button onClick={onExportPDF} className={clsx(styles.actionButton, styles.pdf)}>
              📄 Export PDF
            </button>
          )}
          {onExportCSV && (
            <button onClick={onExportCSV} className={clsx(styles.actionButton, styles.csv)}>
              📊 Export CSV
            </button>
          )}
          {onPrint && (
            <button onClick={onPrint} className={clsx(styles.actionButton, styles.print)}>
              🖨️ Print
            </button>
          )}
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>🎯</div>
          <div className={styles.metricContent}>
            <div className={styles.metricLabel}>FTP Target</div>
            <div className={styles.metricValue}>
              {plan.targetMetrics.ftpTarget ? `${plan.targetMetrics.ftpTarget}W` : 'N/A'}
            </div>
            <div className={styles.metricSubValue}>{ftpGainTargetLabel}</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>⏱️</div>
          <div className={styles.metricContent}>
            <div className={styles.metricLabel}>Total Training Hours</div>
            <div className={styles.metricValue}>
              {plan.weeks.reduce((sum, w) => sum + w.totalHours, 0).toFixed(1)}h
            </div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>📈</div>
          <div className={styles.metricContent}>
            <div className={styles.metricLabel}>Climbing Focus</div>
            <div className={styles.metricValue}>
              {plan.targetMetrics.climbingWatts ? `${plan.targetMetrics.climbingWatts}W` : 'N/A'}
            </div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>🛣️</div>
          <div className={styles.metricContent}>
            <div className={styles.metricLabel}>Est. Endurance</div>
            <div className={styles.metricValue}>{plan.targetMetrics.enduranceHours}h</div>
          </div>
        </div>
      </div>

      <div className={styles.weeksContainer}>
        {plan.weeks.map(week => (
          <TrainingWeekCard
            key={week.weekNumber}
            week={week}
            getSessionIcon={getSessionIcon}
            getPhaseColor={getPhaseColor}
            getWorkoutLevel={getWorkoutLevel}
            getSessionSubtype={getSessionSubtype}
          />
        ))}
      </div>
    </div>
  )
}

function TrainingWeekCard({
  week,
  getSessionIcon,
  getPhaseColor,
  getWorkoutLevel,
  getSessionSubtype,
}: {
  week: TrainingWeek
  getSessionIcon: (type: string) => string
  getPhaseColor: (phase: string) => string
  getWorkoutLevel: (description: string, structuredWorkout?: string[]) => number | null
  getSessionSubtype: (description: string) => string | null
}) {
  return (
    <div className={styles.weekCard} style={{ borderLeftColor: getPhaseColor(week.phase) }}>
      <div className={styles.weekHeader}>
        <div>
          <h3 className={styles.weekNumber}>Week {week.weekNumber}</h3>
          <span
            className={styles.phaseBadge}
            style={{ backgroundColor: getPhaseColor(week.phase) }}
          >
            {week.phase.toUpperCase()}
          </span>
        </div>
        <div className={styles.weekStats}>
          <span>{week.sessions.length} sessions</span>
          <span>{week.totalHours.toFixed(1)}h total</span>
        </div>
      </div>

      <div className={styles.focusPoints}>
        <strong>Focus:</strong>
        <ul>
          {week.focusPoints.map((point, idx) => (
            <li key={idx}>{point}</li>
          ))}
        </ul>
      </div>

      <div className={styles.sessions}>
        {week.sessions.map(session => {
          const workoutLevel = getWorkoutLevel(session.description, session.structuredWorkout)
          const sessionSubtype = getSessionSubtype(session.description)

          return (
          <div key={session.id} className={styles.session}>
            <span className={styles.sessionIcon}>{getSessionIcon(session.type)}</span>
            <div className={styles.sessionDetails}>
              <div className={styles.sessionType}>
                {session.type.replace('_', ' ').toUpperCase()} - Day {session.dayOfWeek}
                {workoutLevel !== null && <span className={styles.levelBadge}>L{workoutLevel.toFixed(1)}</span>}
                {sessionSubtype && <span className={styles.subtypeBadge}>{sessionSubtype}</span>}
              </div>
              <div className={styles.sessionDescription}>{session.description}</div>
              <div className={styles.sessionMeta}>
                {session.duration}min • {session.intensity} • {session.plannedPower && `${session.plannedPower}W`}
              </div>
              {session.structuredWorkout && session.structuredWorkout.length > 0 && (
                <ol className={styles.structuredWorkout}>
                  {session.structuredWorkout.map((step, index) => (
                    <li key={`${session.id}-step-${index}`}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}
