import type { TrainingPlan, TrainingSession, UserProfile } from './types'
import type { StoredPlan } from './storage'

export type RepositoryConflict<T> = {
  code: 'conflict'
  message: string
  latest: T
}

export type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryConflict<T> }

export type PlanWrite = {
  plan: TrainingPlan
  expectedRevision?: number
}

export type SessionWrite = {
  planId: string
  session: TrainingSession
  timezone?: string
}

/**
 * Provider-neutral boundary for account-scoped plan/profile persistence.
 * Implementations must never infer ownership from client-supplied user IDs.
 */
export interface PlanRepository {
  loadProfile(): Promise<UserProfile | undefined>
  saveProfile(profile: UserProfile): Promise<void>
  listPlans(): Promise<StoredPlan[]>
  loadPlan(planId: string): Promise<StoredPlan | undefined>
  createPlan(plan: TrainingPlan): Promise<void>
  listSessions(planId: string): Promise<TrainingSession[]>
  createSession(write: SessionWrite): Promise<void>
  updatePlan(write: PlanWrite): Promise<RepositoryResult<TrainingPlan>>
  deletePlan(planId: string, expectedRevision?: number): Promise<RepositoryResult<TrainingPlan>>
}
