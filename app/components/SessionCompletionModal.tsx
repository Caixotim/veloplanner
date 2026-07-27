'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { SessionCompletion, SessionCompletionStatus, TrainingSession } from '../lib/types'
import styles from './SessionCompletionModal.module.scss'

interface SessionCompletionModalProps {
  session: TrainingSession
  planId: string
  existingCompletion?: SessionCompletion
  onSave: (completion: SessionCompletion) => void
  onDelete?: () => void
  onCancel: () => void
}

const RPE_LABELS: Record<number, string> = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Somewhat Hard',
  5: 'Hard',
  6: 'Hard+',
  7: 'Very Hard',
  8: 'Very Hard+',
  9: 'Max Effort',
  10: 'All Out',
}

const FEELING_OPTIONS: Array<{ value: SessionCompletion['feeling']; label: string; emoji: string }> = [
  { value: 'great', label: 'Great', emoji: '🔥' },
  { value: 'good', label: 'Good', emoji: '😊' },
  { value: 'ok', label: 'OK', emoji: '😐' },
  { value: 'bad', label: 'Bad', emoji: '😓' },
  { value: 'terrible', label: 'Terrible', emoji: '💀' },
]

export default function SessionCompletionModal({
  session,
  planId,
  existingCompletion,
  onSave,
  onDelete,
  onCancel,
}: SessionCompletionModalProps) {
  const [status, setStatus] = useState<SessionCompletionStatus>(existingCompletion?.status ?? 'completed')
  const [rpe, setRpe] = useState<number>(existingCompletion?.rpe ?? 6)
  const [feeling, setFeeling] = useState<SessionCompletion['feeling']>(existingCompletion?.feeling ?? 'good')
  const [actualDuration, setActualDuration] = useState<string>(
    existingCompletion?.actualDurationMinutes != null ? String(existingCompletion.actualDurationMinutes) : String(session.duration)
  )
  const [actualPower, setActualPower] = useState<string>(
    existingCompletion?.actualPower != null ? String(existingCompletion.actualPower) : ''
  )
  const [notes, setNotes] = useState<string>(existingCompletion?.notes ?? '')

  const handleSave = () => {
    const completion: SessionCompletion = {
      sessionId: session.id,
      planId,
      status,
      rpe: status === 'completed' || status === 'partial' ? rpe : undefined,
      feeling: status === 'completed' || status === 'partial' ? feeling : undefined,
      actualDurationMinutes: actualDuration ? parseInt(actualDuration, 10) || undefined : undefined,
      actualPower: actualPower ? parseInt(actualPower, 10) || undefined : undefined,
      notes: notes.trim() || undefined,
      completedAt: existingCompletion?.completedAt ?? Date.now(),
    }
    onSave(completion)
  }

  const isActive = status === 'completed' || status === 'partial'

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Log Session</h2>
          <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.sessionTitle}>
            <span className={styles.sessionType}>{session.type}</span>
            <span className={styles.sessionMeta}>{session.duration} min planned · {new Date(session.date).toLocaleDateString()}</span>
          </div>

          {/* Status */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>How did it go?</label>
            <div className={styles.statusGrid}>
              {(['completed', 'partial', 'skipped'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={clsx(styles.statusBtn, status === s && styles.statusBtnActive, styles[`status_${s}`])}
                  onClick={() => setStatus(s)}
                >
                  {s === 'completed' ? '✅ Completed' : s === 'partial' ? '⚡ Partial' : '🚫 Skipped'}
                </button>
              ))}
            </div>
          </div>

          {/* Feeling */}
          {isActive && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>How did you feel?</label>
              <div className={styles.feelingGrid}>
                {FEELING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={clsx(styles.feelingBtn, feeling === opt.value && styles.feelingBtnActive)}
                    onClick={() => setFeeling(opt.value)}
                  >
                    <span className={styles.feelingEmoji}>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RPE */}
          {isActive && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>RPE (Rate of Perceived Exertion): <strong>{rpe} — {RPE_LABELS[rpe]}</strong></label>
              <div className={styles.rpeRow}>
                <span className={styles.rpeMin}>1</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={rpe}
                  onChange={(e) => setRpe(parseInt(e.target.value, 10))}
                  className={styles.rpeSlider}
                />
                <span className={styles.rpeMax}>10</span>
              </div>
              <div className={styles.rpeTicks}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <span key={n} className={clsx(styles.rpeTick, rpe === n && styles.rpeTickActive)}>{n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Actual duration */}
          {isActive && (
            <div className={styles.inlineFields}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Actual Duration (min)</label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={actualDuration}
                  onChange={(e) => setActualDuration(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Avg Power (W, optional)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={actualPower}
                  onChange={(e) => setActualPower(e.target.value)}
                  className={styles.input}
                  placeholder="—"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={styles.textarea}
              placeholder="How did the intervals feel? Any issues?"
            />
          </div>
        </div>

        <div className={styles.footer}>
          {onDelete && existingCompletion && (
            <button type="button" className={styles.btnDelete} onClick={onDelete}>
              Remove Log
            </button>
          )}
          <button type="button" className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.btnSave} onClick={handleSave}>Save Log</button>
        </div>
      </div>
    </div>
  )
}
