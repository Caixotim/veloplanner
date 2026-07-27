import type { PlanDiff, SessionChange, TrainingPlan, TrainingSession } from './types'


/**
 * Plan versioning and diff detection
 */

/**
 * Compare two plans and detect all changes
 */
export function comparePlans(originalPlan: TrainingPlan, currentPlan: TrainingPlan): PlanDiff {
  const sessionEdits = new Map<string, SessionChange[]>()
  const changedSessions: Array<{
    weekNumber: number
    dayIndex: number
    changes: SessionChange[]
  }> = []

  // Compare each week and session
  for (let weekIdx = 0; weekIdx < originalPlan.weeks.length; weekIdx++) {
    const originalWeek = originalPlan.weeks[weekIdx]
    const currentWeek = currentPlan.weeks[weekIdx]

    if (!currentWeek) continue

    for (let dayIdx = 0; dayIdx < originalWeek.sessions.length; dayIdx++) {
      const originalSession = originalWeek.sessions[dayIdx]
      const currentSession = currentWeek.sessions[dayIdx]

      if (!currentSession) continue

      const changes = compareSession(originalSession, currentSession)

      if (changes.length > 0) {
        const key = `${weekIdx}-${dayIdx}`
        sessionEdits.set(key, changes)
        changedSessions.push({
          weekNumber: weekIdx,
          dayIndex: dayIdx,
          changes,
        })
      }
    }
  }

  const diff: PlanDiff = {
    planId: currentPlan.id,
    sessionEdits,
    totalChanges: changedSessions.length,
    lastModified: Date.now(),
    changedSessions,
  }

  console.info('Plan diff detected', { totalChanges: changedSessions.length })
  return diff
}

/**
 * Compare two training sessions and return changes
 */
export function compareSession(originalSession: TrainingSession, currentSession: TrainingSession): SessionChange[] {
  const changes: SessionChange[] = []

  const fieldsToCompare: (keyof TrainingSession)[] = ['type', 'duration', 'intensity', 'description', 'notes']

  for (const field of fieldsToCompare) {
    const originalValue = originalSession[field]
    const currentValue = currentSession[field]

    if (originalValue !== currentValue) {
      changes.push({
        fieldName: field,
        before: originalValue,
        after: currentValue,
      })
    }
  }

  // Compare equipment arrays
  const originalEquipment = new Set(originalSession.equipment)
  const currentEquipment = new Set(currentSession.equipment)

  if (originalEquipment.size !== currentEquipment.size ||
    ![...originalEquipment].every(eq => currentEquipment.has(eq))) {
    changes.push({
      fieldName: 'equipment',
      before: originalSession.equipment,
      after: currentSession.equipment,
    })
  }

  return changes
}

/**
 * Check if a plan has been modified from original
 */
export function isPlantModified(diff: PlanDiff): boolean {
  return diff.totalChanges > 0
}

/**
 * Get summary of changes for display
 */
export function getChangeSummary(diff: PlanDiff): string {
  if (diff.totalChanges === 0) {
    return 'No changes'
  }

  const changesByType = new Map<string, number>()

  for (const sessionEdit of diff.changedSessions) {
    for (const change of sessionEdit.changes) {
      const type = change.fieldName
      changesByType.set(type, (changesByType.get(type) || 0) + 1)
    }
  }

  const summary = Array.from(changesByType.entries())
    .map(([type, count]) => `${count} ${type}`)
    .join(', ')

  return `${diff.totalChanges} sessions edited (${summary})`
}

/**
 * Apply a diff to a plan
 */
export function applyDiff(originalPlan: TrainingPlan, diff: PlanDiff): TrainingPlan {
  const newPlan = JSON.parse(JSON.stringify(originalPlan)) as TrainingPlan

  for (const sessionEdit of diff.changedSessions) {
    const week = newPlan.weeks[sessionEdit.weekNumber]
    if (!week) continue

    const session = week.sessions[sessionEdit.dayIndex]
    if (!session) continue

    const mutableSession = session as unknown as Record<string, unknown>

    for (const change of sessionEdit.changes) {
      mutableSession[change.fieldName] = change.after
    }
  }

  newPlan.updatedAt = new Date()
  return newPlan
}

/**
 * Revert a plan to its original state
 */
export function revertPlan(
  originalPlan: TrainingPlan,
  currentPlan: TrainingPlan,
  sessionKey: string
): TrainingPlan {
  const [weekIdx, dayIdx] = sessionKey.split('-').map(Number)
  const newPlan = JSON.parse(JSON.stringify(currentPlan)) as TrainingPlan

  const originalSession = originalPlan.weeks[weekIdx]?.sessions[dayIdx]
  if (originalSession) {
    const week = newPlan.weeks[weekIdx]
    if (week) {
      week.sessions[dayIdx] = JSON.parse(JSON.stringify(originalSession))
    }
  }

  newPlan.updatedAt = new Date()
  return newPlan
}

/**
 * Create a version checkpoint
 */
export interface VersionCheckpoint {
  timestamp: number
  description: string
  plan: TrainingPlan
  diff?: PlanDiff
}

/**
 * Version history manager
 */
export class VersionHistory {
  private checkpoints: VersionCheckpoint[] = []

  /**
   * Add a checkpoint
   */
  addCheckpoint(plan: TrainingPlan, description: string, diff?: PlanDiff): void {
    this.checkpoints.push({
      timestamp: Date.now(),
      description,
      plan: JSON.parse(JSON.stringify(plan)),
      diff,
    })

    // Keep only last 10 versions
    if (this.checkpoints.length > 10) {
      this.checkpoints = this.checkpoints.slice(-10)
    }

    console.info('Version checkpoint created', { description, count: this.checkpoints.length })
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): VersionCheckpoint[] {
    return this.checkpoints
  }

  /**
   * Restore to a specific checkpoint
   */
  restoreCheckpoint(index: number): TrainingPlan | null {
    if (index < 0 || index >= this.checkpoints.length) {
      console.warn('Invalid checkpoint index', { index })
      return null
    }

    return JSON.parse(JSON.stringify(this.checkpoints[index].plan))
  }

  /**
   * Get last n checkpoints
   */
  getLastCheckpoints(count: number): VersionCheckpoint[] {
    return this.checkpoints.slice(-count)
  }

  /**
   * Clear history
   */
  clear(): void {
    this.checkpoints = []
  }
}
