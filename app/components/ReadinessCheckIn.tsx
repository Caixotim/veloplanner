'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DailyReadinessEntry } from '../lib/types'
import styles from './ReadinessCheckIn.module.scss'

interface ReadinessCheckInProps {
  date: string
  existingEntry?: DailyReadinessEntry
  onSave: (entry: DailyReadinessEntry) => Promise<void> | void
}

const SCALE = [1, 2, 3, 4, 5] as const

function getReadinessSummary(entry?: DailyReadinessEntry): { label: string; tone: 'good' | 'ok' | 'low'; score: number } {
  if (!entry) {
    return { label: 'Not checked in', tone: 'ok', score: 0 }
  }

  const score = entry.sleepQuality + (6 - entry.stressLevel) + (6 - entry.muscleSoreness)
  if (score >= 11) {
    return { label: 'Ready to go', tone: 'good', score }
  }
  if (score >= 8) {
    return { label: 'Moderate readiness', tone: 'ok', score }
  }
  return { label: 'Recovery advised', tone: 'low', score }
}

export function ReadinessCheckIn({ date, existingEntry, onSave }: ReadinessCheckInProps) {
  const [sleepQuality, setSleepQuality] = useState<1 | 2 | 3 | 4 | 5>(existingEntry?.sleepQuality ?? 3)
  const [stressLevel, setStressLevel] = useState<1 | 2 | 3 | 4 | 5>(existingEntry?.stressLevel ?? 3)
  const [muscleSoreness, setMuscleSoreness] = useState<1 | 2 | 3 | 4 | 5>(existingEntry?.muscleSoreness ?? 3)
  const [notes, setNotes] = useState(existingEntry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    // Keep form hydrated from persisted state when it loads, except immediately after a successful submit reset.
    if (!existingEntry || saveStatus === 'success') {
      return
    }

    setSleepQuality(existingEntry.sleepQuality)
    setStressLevel(existingEntry.stressLevel)
    setMuscleSoreness(existingEntry.muscleSoreness)
    setNotes(existingEntry.notes ?? '')
  }, [existingEntry, saveStatus])

  const draftEntry = useMemo<DailyReadinessEntry>(() => ({
    date,
    sleepQuality,
    stressLevel,
    muscleSoreness,
    notes: notes.trim() || undefined,
    updatedAt: Date.now(),
  }), [date, muscleSoreness, notes, sleepQuality, stressLevel])

  const summary = getReadinessSummary(draftEntry)

  const handleSave = async () => {
    setSaveStatus('idle')
    setStatusMessage('')
    setSaving(true)
    try {
      await onSave(draftEntry)
      // Reset after submit so users can quickly re-enter if needed.
      setSleepQuality(3)
      setStressLevel(3)
      setMuscleSoreness(3)
      setNotes('')
      setSaveStatus('success')
      setStatusMessage('Check-in saved successfully.')
    } catch (error) {
      setSaveStatus('error')
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save check-in.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setSleepQuality(existingEntry?.sleepQuality ?? 3)
    setStressLevel(existingEntry?.stressLevel ?? 3)
    setMuscleSoreness(existingEntry?.muscleSoreness ?? 3)
    setNotes(existingEntry?.notes ?? '')
    setSaveStatus('idle')
    setStatusMessage('')
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3>Morning Readiness</h3>
          <p>{summary.label}</p>
        </div>
        <span className={`${styles.summaryPill} ${styles[summary.tone]}`}>Score {summary.score}</span>
      </div>

      <div className={styles.grid}>
        <ReadinessScale label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} positive />
        <ReadinessScale label="Stress level" value={stressLevel} onChange={setStressLevel} />
        <ReadinessScale label="Muscle soreness" value={muscleSoreness} onChange={setMuscleSoreness} />
      </div>

      <label className={styles.notesField}>
        <span>Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Sleep debt, soreness, travel, stress, etc."
        />
      </label>

      {saveStatus !== 'idle' && (
        <p className={`${styles.statusMessage} ${saveStatus === 'success' ? styles.statusSuccess : styles.statusError}`}>
          {statusMessage}
        </p>
      )}

      <div className={styles.footer}>
        <span className={styles.timestamp}>
          {existingEntry ? `Last updated ${new Date(existingEntry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No check-in saved yet'}
        </span>
        <div className={styles.actionsRow}>
          <button type="button" className={styles.resetBtn} onClick={handleReset} disabled={saving}>
            Reset
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Check-In'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadinessScale({
  label,
  value,
  onChange,
  positive = false,
}: {
  label: string
  value: 1 | 2 | 3 | 4 | 5
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void
  positive?: boolean
}) {
  return (
    <div className={styles.scaleField}>
      <span>{label}</span>
      <div className={styles.scaleRow}>
        {SCALE.map((step) => (
          <button
            key={step}
            type="button"
            className={`${styles.scaleBtn} ${value === step ? styles.active : ''} ${positive ? styles.positive : styles.negative}`}
            onClick={() => onChange(step)}
          >
            {step}
          </button>
        ))}
      </div>
    </div>
  )
}

export function summarizeReadiness(entry?: DailyReadinessEntry): { label: string; tone: 'good' | 'ok' | 'low'; score: number } {
  return getReadinessSummary(entry)
}
