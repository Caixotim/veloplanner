'use client'

import { useMemo, useState } from 'react'
import type { UserZoneProfile } from '@/app/lib/types'
import {
  buildWorkoutProfileVisualSteps,
  summarizeWorkoutProfile,
  type WorkoutProfileStep,
} from '@/app/lib/workoutProfile'
import styles from './WorkoutProfileChart.module.scss'

interface WorkoutProfileChartProps {
  steps: WorkoutProfileStep[]
  hasPowerMeter: boolean
  zoneProfile?: UserZoneProfile
  compact?: boolean
  title?: string
}

export default function WorkoutProfileChart({
  steps,
  hasPowerMeter,
  zoneProfile,
  compact = false,
  title = 'Workout profile',
}: WorkoutProfileChartProps) {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const zoneColors = zoneProfile?.zones.map((zone) => zone.color || '')
  const visualSteps = useMemo(() => buildWorkoutProfileVisualSteps(steps, hasPowerMeter, zoneColors), [hasPowerMeter, steps, zoneColors])
  const summary = useMemo(() => summarizeWorkoutProfile(steps), [steps])
  const selectedStep = selectedStepIndex === null ? null : visualSteps[selectedStepIndex]

  if (visualSteps.length === 0 || summary.totalMinutes <= 0) {
    return <p className={styles.emptyState}>No timed interval profile is available for this session.</p>
  }

  return (
    <section className={`${styles.profile} ${compact ? styles.compact : ''}`} aria-label={title}>
      <div className={styles.header}>
        <div>
          <strong>{title}</strong>
          <span>{hasPowerMeter ? 'Power target' : 'Heart-rate / effort target'} · select a block for details</span>
        </div>
        <div className={styles.summary} aria-label="Workout summary">
          <span><strong>{summary.totalMinutes}</strong> min</span>
          <span><strong>{summary.qualityMinutes}</strong> quality</span>
          <span><strong>{summary.averageIntensityPercent}%</strong> avg</span>
        </div>
      </div>

      <div className={styles.plotShell}>
        <div className={styles.axis} aria-hidden="true">
          <span>Z5</span>
          <span>Z3</span>
          <span>Z1</span>
        </div>
        <div className={styles.plot} role="img" aria-label={`${title}, ${summary.totalMinutes} minutes, ${visualSteps.length} blocks`}>
          <div className={styles.gridLineTop} />
          <div className={styles.gridLineMiddle} />
          <div className={styles.gridLineBottom} />
          <div className={styles.segments}>
            {visualSteps.map((step, index) => {
              const isSelected = selectedStepIndex === index
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`${styles.segment} ${isSelected ? styles.segmentSelected : ''}`}
                  style={{ flexGrow: Math.max(1, step.minutes) }}
                  onMouseEnter={() => setSelectedStepIndex(index)}
                  onFocus={() => setSelectedStepIndex(index)}
                  onClick={() => setSelectedStepIndex(index)}
                  aria-label={`${step.note}, ${step.minutes} minutes, ${step.zone}, ${step.target}`}
                  title={`${step.note} · ${step.minutes} min · ${step.target}`}
                >
                  <span
                    className={styles.segmentFill}
                    style={{
                      height: `${step.height}%`,
                      background: step.color,
                    }}
                  />
                  {!compact && step.minutes >= 5 && <span className={styles.segmentLabel}>{step.note}</span>}
                  <span className={styles.segmentIntensity}>{Math.round(step.intensityPercent)}%</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className={styles.timeline} aria-hidden="true">
        <span>0:00</span>
        <span>{Math.floor(summary.totalMinutes / 2)}:00</span>
        <span>{summary.totalMinutes}:00</span>
      </div>

      {selectedStep ? (
        <div className={styles.selectedStep} aria-live="polite">
          <div>
            <strong>{selectedStep.note}</strong>
            <span>{selectedStep.target}</span>
          </div>
          <div className={styles.selectedMeta}>
            <span>{selectedStep.minutes} min</span>
            <span>{selectedStep.zone}</span>
            <span>{Math.round(selectedStep.intensityPercent)}%</span>
          </div>
        </div>
      ) : (
        <div className={styles.selectedStepPlaceholder}>
          <span>Tap or hover a block to inspect its target</span>
          <span>{summary.recoveryMinutes} min easy / recovery</span>
        </div>
      )}
    </section>
  )
}
