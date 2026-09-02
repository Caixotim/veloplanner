'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { Equipment, TrainingSession, UserZoneProfile } from '@/app/lib/types'
import { getTemplatesForType } from '@/app/lib/workoutTemplates'
import styles from './SessionEditorModal.module.scss'

/**
 * Props for SessionEditorModal
 */
interface SessionEditorModalProps {
  session: TrainingSession
  originalSession: TrainingSession
  profileEquipment: Equipment[]
  onSave: (updatedSession: TrainingSession) => void
  onCancel: () => void
  mode?: 'view' | 'edit'
  onSwitchToEdit?: () => void
  weekNumber: number
  dayIndex: number
  hasPowerMeter: boolean
  zoneProfile?: UserZoneProfile
  zoneVersionOptions?: Array<{
    versionLabel: string
    ftp: number
    date: string
  }>
}

const STRENGTH_EQUIPMENT_OPTIONS: Equipment[] = ['resistance_bands', 'dumbbells', 'rowing_machine']
const EQUIPMENT_ICONS: Record<Equipment, string> = {
  indoor_trainer: '🏋️',
  resistance_bands: '🎯',
  rowing_machine: '🚣',
  dumbbells: '⚖️',
}

type EnduranceMode = 'outdoor' | 'indoor_trainer' | 'rowing_machine'

type WorkoutStepDraft = {
  id: string
  minutes: number
  target: string
  note: string
}

const ENDURANCE_MODE_LABELS: Record<EnduranceMode, string> = {
  outdoor: '🛣️ Outdoor',
  indoor_trainer: '🏋️ Trainer',
  rowing_machine: '🚣 Rower',
}

/**
 * Modal for editing all session details
 */
export default function SessionEditorModal({
  session,
  originalSession,
  profileEquipment,
  onSave,
  onCancel,
  mode = 'edit',
  onSwitchToEdit,
  weekNumber,
  dayIndex,
  hasPowerMeter,
  zoneProfile,
  zoneVersionOptions = [],
}: SessionEditorModalProps) {
  const isViewMode = mode === 'view'
  const [edited, setEdited] = useState<TrainingSession>({ ...session })
  const [showDiff, setShowDiff] = useState(false)
  const [useEquipmentOverride, setUseEquipmentOverride] = useState(false)
  const [workoutSteps, setWorkoutSteps] = useState<WorkoutStepDraft[]>(() => parseStructuredWorkout(session.structuredWorkout))
  const [selectedZoneVersionLabel, setSelectedZoneVersionLabel] = useState<string>(session.zoneVersionLabel || '')
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const availableTemplates = getTemplatesForType(edited.type)

  const selectedZoneVersion = zoneVersionOptions.find((option) => option.versionLabel === selectedZoneVersionLabel)

  const isStrengthSession = edited.type === 'strength'
  const usesRower = edited.equipment.includes('rowing_machine')
  const usesTrainer = edited.equipment.includes('indoor_trainer')
  const currentEnduranceMode: EnduranceMode = usesRower ? 'rowing_machine' : usesTrainer ? 'indoor_trainer' : 'outdoor'

  /**
   * Handle field changes
   */
  const handleFieldChange = (field: keyof TrainingSession, value: unknown) => {
    setEdited((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  /**
   * Handle equipment toggle
   */
  const toggleEquipment = (equipment: Equipment) => {
    setEdited((prev) => {
      const equipmentSet = new Set(prev.equipment)
      if (equipmentSet.has(equipment)) {
        equipmentSet.delete(equipment)
      } else {
        equipmentSet.add(equipment)
      }
      return {
        ...prev,
        equipment: Array.from(equipmentSet),
      }
    })
  }

  const setEnduranceMode = (mode: EnduranceMode) => {
    setEdited((prev) => {
      const nextEquipment: Equipment[] = prev.equipment.filter(
        (item) => item !== 'indoor_trainer' && item !== 'rowing_machine'
      )

      if (mode === 'indoor_trainer') {
        nextEquipment.push('indoor_trainer')
      }

      if (mode === 'rowing_machine') {
        nextEquipment.push('rowing_machine')
      }

      return {
        ...prev,
        equipment: Array.from(new Set(nextEquipment)),
      }
    })
  }

  /**
   * Get changes made
   */
  const getChanges = () => {
    const changes: Record<string, { before: unknown; after: unknown }> = {}

    if (edited.type !== originalSession.type) {
      changes.type = { before: originalSession.type, after: edited.type }
    }
    if (edited.duration !== originalSession.duration) {
      changes.duration = { before: originalSession.duration, after: edited.duration }
    }
    if (edited.intensity !== originalSession.intensity) {
      changes.intensity = { before: originalSession.intensity, after: edited.intensity }
    }
    if (edited.description !== originalSession.description) {
      changes.description = { before: originalSession.description, after: edited.description }
    }
    if (edited.notes !== originalSession.notes) {
      changes.notes = { before: originalSession.notes, after: edited.notes }
    }
    const originalEquipmentSet = new Set(originalSession.equipment)
    const editedEquipmentSet = new Set(edited.equipment)
    const equipmentChanged =
      originalEquipmentSet.size !== editedEquipmentSet.size ||
      [...originalEquipmentSet].some((item) => !editedEquipmentSet.has(item))
    if (equipmentChanged) {
      changes.equipment = { before: originalSession.equipment, after: edited.equipment }
    }

    const serializedSteps = serializeStructuredWorkout(workoutSteps)
    const originalSteps = originalSession.structuredWorkout || []
    const structuredChanged =
      serializedSteps.length !== originalSteps.length ||
      serializedSteps.some((line, index) => line !== originalSteps[index])

    if (structuredChanged) {
      changes.structuredWorkout = { before: originalSteps, after: serializedSteps }
    }

    return changes
  }

  const changes = getChanges()
  const hasChanges = Object.keys(changes).length > 0

  const updateWorkoutStep = (index: number, next: Partial<WorkoutStepDraft>) => {
    setWorkoutSteps((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...next }
      return updated
    })
  }

  const addWorkoutStep = () => {
    setWorkoutSteps((prev) => [
      ...prev,
      {
        id: `step_${Date.now()}_${prev.length + 1}`,
        minutes: 10,
        target: hasPowerMeter ? '85-95% FTP' : '80-88% HRmax',
        note: 'steady block',
      },
    ])
  }

  const removeWorkoutStep = (index: number) => {
    setWorkoutSteps((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveWorkoutStep = (index: number, direction: 'up' | 'down') => {
    setWorkoutSteps((prev) => {
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev
      }

      const updated = [...prev]
      const [moved] = updated.splice(index, 1)
      updated.splice(nextIndex, 0, moved)
      return updated
    })
  }

  const reorderWorkoutSteps = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return
    }

    setWorkoutSteps((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev
      }

      const updated = [...prev]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)
      return updated
    })
  }

  const handleSave = () => {
    const serializedSteps = serializeStructuredWorkout(workoutSteps)
    onSave({
      ...edited,
      structuredWorkout: serializedSteps,
      zoneVersionLabel: selectedZoneVersion?.versionLabel,
      zoneVersionFtp: selectedZoneVersion?.ftp,
    })
  }

  if (isViewMode) {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <h2>
              Session Details - Week {weekNumber}, Day {dayIndex + 1}
            </h2>
            <button type="button" className={styles.closeBtn} onClick={onCancel}>
              ✕
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.detailGrid}>
              <div className={styles.detailCard}>
                <span className={styles.detailLabel}>Type</span>
                <strong>{session.type}</strong>
              </div>
              <div className={styles.detailCard}>
                <span className={styles.detailLabel}>Duration</span>
                <strong>{session.duration} min</strong>
              </div>
              <div className={styles.detailCard}>
                <span className={styles.detailLabel}>Intensity</span>
                <strong>{session.intensity}</strong>
              </div>
              <div className={styles.detailCard}>
                <span className={styles.detailLabel}>Date</span>
                <strong>{new Date(session.date).toLocaleDateString()}</strong>
              </div>
            </div>

            {session.plannedPower && (
              <div className={styles.infoPanel}>
                <strong>Target Power:</strong> {session.plannedPower}W
              </div>
            )}

            {!session.plannedPower && session.plannedHeartRate && (
              <div className={styles.infoPanel}>
                <strong>Target HR:</strong> {session.plannedHeartRate.min}-{session.plannedHeartRate.max} bpm
              </div>
            )}

            {session.equipment.length > 0 && (
              <div className={styles.infoPanel}>
                <strong>Equipment:</strong> {session.equipment.join(', ').replace(/_/g, ' ')}
              </div>
            )}

            <div className={styles.infoPanel}>
              <strong>Description</strong>
              <p className={styles.descriptionText}>{getReadableSessionDescription(session.description)}</p>
            </div>

            {session.structuredWorkout && session.structuredWorkout.length > 0 && (
              <div className={styles.infoPanel}>
                <strong>Structured Workout</strong>
                <ul className={styles.detailList}>
                  {getReadableWorkoutSteps(session.structuredWorkout).map((step, index) => (
                    <li key={`step-${index}`}>{step}</li>
                  ))}
                </ul>
                <div className={styles.workoutGraph} aria-label="Workout intensity graph">
                  <div className={styles.workoutGraphHeader}>
                    <strong>Workout structure</strong>
                    <span>{hasPowerMeter ? 'Power zones · width = duration' : 'HR zones · width = duration'}</span>
                  </div>
                  <div className={styles.workoutGraphBars}>
                    {parseStructuredWorkout(getReadableWorkoutSteps(session.structuredWorkout)).map((step, index) => (
                      <div
                        key={`graph-step-${step.id}`}
                        className={styles.workoutGraphColumn}
                        style={{ flexGrow: Math.max(1, step.minutes) }}
                        title={`Block ${index + 1}: ${step.minutes} min · ${step.target}`}
                      >
                        <div
                          className={styles.workoutGraphBar}
                          style={{
                            height: `${getWorkoutBarHeight(step.target)}%`,
                            background: getWorkoutZoneColor(step.target, hasPowerMeter, zoneProfile),
                          }}
                          aria-label={`${getWorkoutZone(step.target, hasPowerMeter, zoneProfile)} · ${step.minutes} minutes`}
                        />
                        <span>{getWorkoutZone(step.target, hasPowerMeter, zoneProfile)}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.workoutGraphAxis}>
                    <span>Z1 · recovery</span>
                    <span>Z5 · hard</span>
                  </div>
                </div>
              </div>
            )}

            {session.preDayNutritionTip && (
              <div className={styles.nutritionTipPanel}>
                <div className={styles.nutritionTipHeader}>
                  <span className={styles.nutritionTipIcon}>🥗</span>
                  <span className={styles.nutritionTipLabel}>Night-before nutrition tip</span>
                </div>
                <p className={styles.nutritionTipText}>{session.preDayNutritionTip}</p>
              </div>
            )}

            {session.notes && (
              <div className={styles.infoPanel}>
                <strong>Coaching cues</strong>
                <p className={styles.guidanceText}>{getReadableSessionNotes(session)}</p>
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onCancel}>
              Close
            </button>
            {onSwitchToEdit && (
              <button type="button" className={styles.btnSave} onClick={onSwitchToEdit}>
                Edit Session
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>
            Edit Session - Week {weekNumber}, Day {dayIndex + 1}
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Session Type */}
          <div className={styles.formGroup}>
            <label htmlFor="sessionType">Session Type</label>
            <select
              id="sessionType"
              value={edited.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              className={styles.select}
            >
              <option value="endurance">🛣️ Endurance</option>
              <option value="tempo">🚴 Tempo</option>
              <option value="threshold">⚡ Threshold</option>
              <option value="vo2max">🔥 VO2 Max</option>
              <option value="anaerobic">💪 Anaerobic</option>
              <option value="strength">🏋️ Strength</option>
              <option value="recovery">☁️ Recovery</option>
            </select>
          </div>

          {/* Duration */}
          <div className={styles.formGroup}>
            <label htmlFor="duration">Duration (minutes)</label>
            <input
              id="duration"
              type="number"
              min="1"
              max="480"
              value={edited.duration}
              onChange={(e) => handleFieldChange('duration', parseInt(e.target.value, 10))}
              className={styles.input}
            />
          </div>

          {/* Intensity */}
          <div className={styles.formGroup}>
            <label htmlFor="intensity">Intensity</label>
            <select
              id="intensity"
              value={edited.intensity}
              onChange={(e) => handleFieldChange('intensity', e.target.value as TrainingSession['intensity'])}
              className={styles.select}
            >
              <option value="easy">🟢 Easy</option>
              <option value="moderate">🟡 Moderate</option>
              <option value="hard">🟠 Hard</option>
              <option value="very_hard">🔴 Very Hard</option>
            </select>
          </div>

          {/* Planned Power */}
          {hasPowerMeter && (
            <div className={styles.formGroup}>
              <label htmlFor="power">Target Power (W)</label>
              <input
                id="power"
                type="number"
                min="0"
                value={edited.plannedPower || 0}
                onChange={(e) => handleFieldChange('plannedPower', parseInt(e.target.value, 10))}
                className={styles.input}
              />
            </div>
          )}

          {!hasPowerMeter && edited.plannedHeartRate && (
            <div className={styles.formGroup}>
              <label htmlFor="hrMin">Target Heart Rate (bpm)</label>
              <div className={styles.inputRow}>
                <input
                  id="hrMin"
                  type="number"
                  min="0"
                  value={edited.plannedHeartRate.min}
                  onChange={(e) =>
                    handleFieldChange('plannedHeartRate', {
                      min: parseInt(e.target.value, 10),
                      max: edited.plannedHeartRate?.max || 0,
                    })
                  }
                  className={styles.input}
                />
                <input
                  id="hrMax"
                  type="number"
                  min="0"
                  value={edited.plannedHeartRate.max}
                  onChange={(e) =>
                    handleFieldChange('plannedHeartRate', {
                      min: edited.plannedHeartRate?.min || 0,
                      max: parseInt(e.target.value, 10),
                    })
                  }
                  className={styles.input}
                />
              </div>
            </div>
          )}

          {/* Equipment */}
          <div className={styles.formGroup}>
            <label>Session Equipment</label>
            <div className={styles.overrideRow}>
              <button
                type="button"
                className={clsx(styles.overrideBtn, useEquipmentOverride && styles.selected)}
                onClick={() => setUseEquipmentOverride((prev) => !prev)}
              >
                {useEquipmentOverride ? '✓' : '○'} Override default for this session
              </button>
            </div>

            {!useEquipmentOverride && <p className={styles.equipmentHint}>Using generated session equipment.</p>}

            {useEquipmentOverride && !isStrengthSession && (
              <div className={styles.equipmentGrid}>
                {(['outdoor', 'indoor_trainer', 'rowing_machine'] as EnduranceMode[]).map((mode) => {
                  const isProfileAvailable = mode === 'outdoor' || profileEquipment.includes(mode)
                  return (
                    <button
                      key={mode}
                      type="button"
                      className={clsx(styles.equipmentBtn, currentEnduranceMode === mode && styles.selected)}
                      onClick={() => setEnduranceMode(mode)}
                      disabled={!isProfileAvailable}
                      title={isProfileAvailable ? undefined : 'Not available in profile equipment'}
                    >
                      {ENDURANCE_MODE_LABELS[mode]}
                    </button>
                  )
                })}
              </div>
            )}

            {useEquipmentOverride && isStrengthSession && (
              <div className={styles.equipmentGrid}>
                {STRENGTH_EQUIPMENT_OPTIONS.map((eq) => {
                  const isProfileAvailable = profileEquipment.includes(eq)
                  return (
                    <button
                      key={eq}
                      type="button"
                      className={clsx(styles.equipmentBtn, edited.equipment.includes(eq) && styles.selected)}
                      onClick={() => toggleEquipment(eq)}
                      disabled={!isProfileAvailable}
                      title={isProfileAvailable ? undefined : 'Not available in profile equipment'}
                    >
                      {EQUIPMENT_ICONS[eq]} {eq.replace('_', ' ')}
                    </button>
                  )
                })}
              </div>
            )}

            {useEquipmentOverride && (
              <p className={styles.equipmentHint}>
                {isStrengthSession
                  ? 'Choose the strength tools for this session.'
                  : 'Choose a single mode for this ride.'}
              </p>
            )}
          </div>

          {/* Description */}
          <div className={styles.formGroup}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={edited.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className={styles.textarea}
              rows={3}
            />
          </div>

          {/* Structured Workout Builder */}
          <div className={styles.formGroup}>
            <div className={styles.builderHeaderRow}>
              <label>Structured Workout Steps</label>
              <div className={styles.builderHeaderActions}>
                {availableTemplates.length > 0 && (
                  <button
                    type="button"
                    className={styles.loadTemplateBtn}
                    onClick={() => setShowTemplatePicker((prev) => !prev)}
                  >
                    Load Template
                  </button>
                )}
                <button type="button" className={styles.addStepBtn} onClick={addWorkoutStep}>
                  + Add Step
                </button>
              </div>
            </div>

            {showTemplatePicker && availableTemplates.length > 0 && (
              <div className={styles.templatePickerPanel}>
                {availableTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={styles.templateOption}
                    onClick={() => {
                      setWorkoutSteps(
                        template.steps.map((step, index) => ({
                          id: `step_${Date.now()}_${index + 1}`,
                          minutes: step.minutes,
                          target: step.target,
                          note: step.note,
                        }))
                      )
                      setShowTemplatePicker(false)
                    }}
                  >
                    <strong>{template.name}</strong>
                    <span>{template.steps.length} steps • {template.steps.reduce((sum, s) => sum + s.minutes, 0)} min</span>
                  </button>
                ))}
              </div>
            )}

            {zoneVersionOptions.length > 0 && (
              <div className={styles.zoneVersionRow}>
                <span>Zone Version</span>
                <select
                  value={selectedZoneVersionLabel}
                  onChange={(e) => setSelectedZoneVersionLabel(e.target.value)}
                  className={styles.select}
                >
                  <option value="">No lock</option>
                  {zoneVersionOptions.map((option) => (
                    <option key={option.versionLabel} value={option.versionLabel}>
                      {option.versionLabel} ({option.ftp}W • {option.date})
                    </option>
                  ))}
                </select>
                <small className={styles.zoneVersionHint}>
                  {selectedZoneVersion
                    ? `Targets are now linked to ${selectedZoneVersion.versionLabel} (${selectedZoneVersion.ftp}W FTP).`
                    : 'Select a version to lock targets to a specific threshold snapshot.'}
                </small>
              </div>
            )}

            <div className={styles.stepList}>
              {workoutSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={clsx(styles.stepCard, draggedStepIndex === index && styles.stepCardDragging)}
                  draggable
                  onDragStart={() => setDraggedStepIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault()
                  }}
                  onDrop={() => {
                    if (draggedStepIndex === null) {
                      return
                    }

                    reorderWorkoutSteps(draggedStepIndex, index)
                    setDraggedStepIndex(null)
                  }}
                  onDragEnd={() => setDraggedStepIndex(null)}
                >
                  <div className={styles.stepTopRow}>
                    <strong>Step {index + 1}</strong>
                    <span className={styles.dragHint} title="Drag to reorder this interval step">Drag</span>
                    <div className={styles.stepActionsRow}>
                      <button
                        type="button"
                        className={styles.stepMoveBtn}
                        onClick={() => moveWorkoutStep(index, 'up')}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={styles.stepMoveBtn}
                        onClick={() => moveWorkoutStep(index, 'down')}
                        disabled={index === workoutSteps.length - 1}
                      >
                        Down
                      </button>
                      <button type="button" className={styles.removeStepBtn} onClick={() => removeWorkoutStep(index)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className={styles.stepGrid}>
                    <div>
                      <span>Minutes</span>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={step.minutes}
                        onChange={(e) => updateWorkoutStep(index, { minutes: parseInt(e.target.value, 10) || 1 })}
                        className={styles.input}
                      />
                    </div>
                    <div>
                      <span>Target</span>
                      <input
                        type="text"
                        value={step.target}
                        onChange={(e) => updateWorkoutStep(index, { target: e.target.value })}
                        className={styles.input}
                        placeholder={hasPowerMeter ? 'e.g. 92-100% FTP' : 'e.g. 85-90% HRmax'}
                      />
                    </div>
                  </div>
                  <div>
                    <span>Focus</span>
                    <input
                      type="text"
                      value={step.note}
                      onChange={(e) => updateWorkoutStep(index, { note: e.target.value })}
                      className={styles.input}
                      placeholder="e.g. seated cadence control"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pre-day nutrition tip */}
          {edited.preDayNutritionTip && (
            <div className={styles.nutritionTipPanel}>
              <div className={styles.nutritionTipHeader}>
                <span className={styles.nutritionTipIcon}>🥗</span>
                <span className={styles.nutritionTipLabel}>Night-before nutrition tip</span>
              </div>
              <p className={styles.nutritionTipText}>{edited.preDayNutritionTip}</p>
            </div>
          )}

          {/* Notes */}
          <div className={styles.formGroup}>
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={edited.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              className={styles.textarea}
              rows={2}
            />
          </div>

          {/* Changes Summary */}
          {hasChanges && (
            <div className={styles.changesSummary}>
              <button type="button" className={styles.diffToggle} onClick={() => setShowDiff(!showDiff)}>
                {showDiff ? '▼' : '▶'} Changes ({Object.keys(changes).length})
              </button>

              {showDiff && (
                <div className={styles.changesList}>
                  {Object.entries(changes).map(([field, { before, after }]) => (
                    <div key={field} className={styles.change}>
                      <div className={styles.fieldName}>{field}</div>
                      <div className={styles.changeDetail}>
                        <span className={styles.before}>
                          {typeof before === 'object' ? JSON.stringify(before) : String(before)}
                        </span>
                        <span className={styles.arrow}>→</span>
                        <span className={styles.after}>
                          {typeof after === 'object' ? JSON.stringify(after) : String(after)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onCancel}>
            Cancel
          </button>
          {hasChanges && (
            <button
              type="button"
              className={styles.btnReset}
              onClick={() => {
                setEdited({ ...originalSession })
                setWorkoutSteps(parseStructuredWorkout(originalSession.structuredWorkout))
                setSelectedZoneVersionLabel(originalSession.zoneVersionLabel || '')
                setUseEquipmentOverride(false)
              }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className={clsx(styles.btnSave, !hasChanges && styles.disabled)}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function parseStructuredWorkout(lines?: string[]): WorkoutStepDraft[] {
  const source = (lines || []).filter((line) => !line.toLowerCase().startsWith('workout level'))
  const parsed = source
    .map((line, index) => {
      const durationMatch = line.match(/(\d+)\s*'/)
      const minutes = durationMatch ? parseInt(durationMatch[1], 10) : 10
      const [first, ...rest] = line.split(' at ')
      const target = rest.length > 0 ? rest.join(' at ').trim() : ''
      return {
        id: `step_${index + 1}`,
        minutes,
        target: target || 'steady',
        note: first.replace(/^[\d\sxX']+/, '').replace(/^[^A-Za-z0-9]+/, '').trim() || 'main set',
      }
    })
    .filter((step) => step.minutes > 0)

  if (parsed.length > 0) {
    return parsed
  }

  return [
    {
      id: 'step_1',
      minutes: 10,
      target: 'easy',
      note: 'warm-up',
    },
    {
      id: 'step_2',
      minutes: 20,
      target: 'steady',
      note: 'main set',
    },
  ]
}

function getWorkoutBarHeight(target: string): number {
  const match = target.match(/(\d+(?:\.\d+)?)/)
  const value = match ? Number(match[1]) : 60
  return Math.max(24, Math.min(100, ((value - 50) / 70) * 76 + 24))
}

function getWorkoutZone(target: string, hasPowerMeter: boolean, zoneProfile?: UserZoneProfile): string {
  const percentages = [...target.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]))
  const percentage = percentages.length > 0 ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null

  if (percentage === null) {
    return 'Z2'
  }

  if (zoneProfile?.zones?.length) {
    const zoneIndex = zoneProfile.zones.findIndex((zone) => percentage >= zone.minPct * 100 && percentage <= zone.maxPct * 100)
    if (zoneIndex >= 0) {
      return `Z${zoneIndex + 1}`
    }
  }

  if (hasPowerMeter) {
    if (percentage <= 55) return 'Z1'
    if (percentage <= 75) return 'Z2'
    if (percentage <= 90) return 'Z3'
    if (percentage <= 105) return 'Z4'
    return 'Z5'
  }

  if (percentage <= 68) return 'Z1'
  if (percentage <= 83) return 'Z2'
  if (percentage <= 94) return 'Z3'
  if (percentage <= 105) return 'Z4'
  return 'Z5'
}

function getWorkoutZoneColor(target: string, hasPowerMeter: boolean, zoneProfile?: UserZoneProfile): string {
  const zoneLabel = getWorkoutZone(target, hasPowerMeter, zoneProfile)
  const zoneIndex = Number(zoneLabel.replace('Z', '')) - 1
  return zoneProfile?.zones[zoneIndex]?.color || ['#b0d4f1', '#83c5e5', '#f5a623', '#e07b39', '#d94f3d', '#9b2335'][zoneIndex] || '#39ffb6'
}

function getReadableSessionDescription(description: string): string {
  const segments = description
    .split('|')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const uniqueSegments = segments.filter(
    (segment, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === segment.toLowerCase()) === index
  )
  const readableSegments = uniqueSegments
    .filter((segment) => !/^(?:-\s*)?(?:warmup|cooldown)$/i.test(segment))
    .slice(0, 4)

  if (readableSegments.length > 0) {
    const summary = readableSegments.join(' · ')
    return summary.length > 240 ? `${summary.slice(0, 237).trimEnd()}...` : summary
  }

  return description.replace(/\s+/g, ' ').trim() || 'No description'
}

function getReadableSessionNotes(session: TrainingSession): string {
  if (!session.notes || !/workout level|\d+\s*'/i.test(session.notes)) {
    return session.notes || 'No additional coaching cues.'
  }

  const duration = session.duration
  const cues = session.type === 'recovery'
    ? ['Keep the effort genuinely easy and finish feeling better than you started.']
    : session.type === 'strength'
      ? ['Use controlled movement and stable posture; leave one or two good reps in reserve.']
      : session.type === 'vo2max' || session.type === 'anaerobic'
        ? ['Prioritize quality: keep hard efforts sharp and recover fully between repetitions.']
        : session.type === 'threshold'
          ? ['Start conservatively and keep each interval controlled rather than sprinting the first minute.']
          : ['Keep the effort smooth and steady; avoid chasing speed.']

  if (duration >= 60) {
    cues.push(`Fuel: aim for ${duration >= 90 ? '40–60' : '30–45'}g carbohydrate per hour, starting in the first 30 minutes.`)
  } else if (duration >= 45 && session.type !== 'recovery') {
    cues.push('Fuel: have a small carbohydrate snack beforehand; water is usually enough during this session.')
  }

  if (duration >= 60 || ['threshold', 'vo2max', 'anaerobic'].includes(session.type)) {
    cues.push('After: eat carbohydrates with 20–30g protein within two hours and replace fluids.')
  }

  return cues.join('\n')
}

function getReadableWorkoutSteps(lines: string[]): string[] {
  const steps = lines
    .flatMap((line) => line.split('|'))
    .map((step) => step.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const uniqueSteps = steps.filter(
    (step, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === step.toLowerCase()) === index
  )

  return uniqueSteps.slice(0, 8)
}

function serializeStructuredWorkout(steps: WorkoutStepDraft[]): string[] {
  return steps
    .filter((step) => step.minutes > 0)
    .map((step) => `${step.note || 'block'} ${step.minutes}' at ${step.target || 'steady'}`)
}
