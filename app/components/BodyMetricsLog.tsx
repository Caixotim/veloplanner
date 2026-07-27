'use client'

import { useMemo, useState } from 'react'
import type { BodyMetricsEntry } from '../lib/types'
import styles from './BodyMetricsLog.module.scss'

interface BodyMetricsLogProps {
  entries: BodyMetricsEntry[]
  defaultWeightKg?: number
  defaultRestingHr?: number
  onSave: (entry: BodyMetricsEntry) => Promise<void> | void
}

function todayKey(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export function BodyMetricsLog({ entries, defaultWeightKg, defaultRestingHr, onSave }: BodyMetricsLogProps) {
  const today = todayKey()
  const existingToday = entries.find((entry) => entry.date === today)
  const [weightKg, setWeightKg] = useState(existingToday?.weightKg != null ? String(existingToday.weightKg) : defaultWeightKg != null ? String(defaultWeightKg) : '')
  const [restingHr, setRestingHr] = useState(existingToday?.restingHr != null ? String(existingToday.restingHr) : defaultRestingHr != null ? String(defaultRestingHr) : '')
  const [hrvMs, setHrvMs] = useState(existingToday?.hrvMs != null ? String(existingToday.hrvMs) : '')
  const [notes, setNotes] = useState(existingToday?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const latestEntries = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [entries])

  const handleSave = async () => {
    const entry: BodyMetricsEntry = {
      date: today,
      weightKg: weightKg ? Number(weightKg) : undefined,
      restingHr: restingHr ? Number(restingHr) : undefined,
      hrvMs: hrvMs ? Number(hrvMs) : undefined,
      notes: notes.trim() || undefined,
      updatedAt: Date.now(),
    }

    setSaving(true)
    try {
      await onSave(entry)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3>Body Metrics Log</h3>
          <p>Track weight, resting HR, and HRV to add context to training load and recovery.</p>
        </div>
        <span className={styles.todayChip}>{today}</span>
      </div>

      <div className={styles.formGrid}>
        <label>
          <span>Weight (kg)</span>
          <input type="number" step="0.1" min="30" max="200" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
        </label>
        <label>
          <span>Resting HR (bpm)</span>
          <input type="number" min="20" max="120" value={restingHr} onChange={(event) => setRestingHr(event.target.value)} />
        </label>
        <label>
          <span>HRV (ms)</span>
          <input type="number" min="0" max="300" value={hrvMs} onChange={(event) => setHrvMs(event.target.value)} />
        </label>
      </div>

      <label className={styles.notesField}>
        <span>Notes</span>
        <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Travel, poor sleep, illness, menstrual cycle, etc." />
      </label>

      <div className={styles.footer}>
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : existingToday ? 'Update Metrics' : 'Save Metrics'}
        </button>
      </div>

      <div className={styles.history}>
        <h4>Recent entries</h4>
        {latestEntries.length === 0 ? (
          <p className={styles.emptyState}>No metrics logged yet.</p>
        ) : (
          <ul>
            {latestEntries.map((entry) => (
              <li key={entry.date}>
                <strong>{entry.date}</strong>
                <span>{entry.weightKg != null ? `${entry.weightKg} kg` : '—'}</span>
                <span>{entry.restingHr != null ? `${entry.restingHr} bpm` : '—'}</span>
                <span>{entry.hrvMs != null ? `${entry.hrvMs} ms` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
