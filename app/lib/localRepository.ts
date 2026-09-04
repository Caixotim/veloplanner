import type { TrainingPlan, TrainingSession, UserProfile } from './types'
import { storage, type StoredPlan } from './storage'
import type { PlanRepository, PlanWrite, RepositoryResult, SessionWrite } from './repository'

const ACTIVE_PROFILE_KEY = 'active-profile'

export interface LocalRepositoryStorage {
  loadProfile(profileId: string): Promise<UserProfile | undefined>
  saveProfile(profile: UserProfile): Promise<void>
  loadAllPlans(): Promise<StoredPlan[]>
  loadPlan(planId: string): Promise<StoredPlan | undefined>
  savePlan(plan: TrainingPlan, isNew?: boolean): Promise<string>
  updatePlan(planId: string, updates: Partial<TrainingPlan>): Promise<void>
  deletePlan(planId: string): Promise<void>
}

/** Local implementation of the provider-neutral plan repository contract. */
export class LocalRepository implements PlanRepository {
  constructor(private readonly backend: LocalRepositoryStorage = storage) {}

  loadProfile(): Promise<UserProfile | undefined> {
    return this.backend.loadProfile(ACTIVE_PROFILE_KEY)
  }

  saveProfile(profile: UserProfile): Promise<void> {
    return this.backend.saveProfile(profile)
  }

  listPlans(): Promise<StoredPlan[]> {
    return this.backend.loadAllPlans()
  }

  loadPlan(planId: string): Promise<StoredPlan | undefined> {
    return this.backend.loadPlan(planId)
  }

  async createPlan(plan: TrainingPlan): Promise<void> {
    await this.backend.savePlan({ ...plan, revision: plan.revision ?? 0 }, true)
  }

  async listSessions(planId: string): Promise<TrainingSession[]> {
    const stored = await this.backend.loadPlan(planId)
    return stored?.plan.weeks.flatMap((week) => week.sessions) ?? []
  }

  async createSession({ planId, session }: SessionWrite): Promise<void> {
    const stored = await this.backend.loadPlan(planId)
    if (!stored || stored.plan.weeks.some((week) => week.sessions.some((item) => item.id === session.id))) return
    throw new Error(`Session ${session.id} does not belong to local plan ${planId}`)
  }

  async updatePlan({ plan, expectedRevision }: PlanWrite): Promise<RepositoryResult<TrainingPlan>> {
    const stored = await this.backend.loadPlan(plan.id)
    if (!stored) {
      throw new Error(`Plan ${plan.id} not found`)
    }

    const currentRevision = stored.plan.revision ?? 0
    if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
      return {
        ok: false,
        error: {
          code: 'conflict',
          message: `Plan ${plan.id} changed before this update was applied`,
          latest: stored.plan,
        },
      }
    }

    const updatedPlan = {
      ...plan,
      revision: currentRevision + 1,
    }
    await this.backend.updatePlan(plan.id, updatedPlan)
    return { ok: true, value: updatedPlan }
  }

  async deletePlan(planId: string, expectedRevision?: number): Promise<RepositoryResult<TrainingPlan>> {
    const stored = await this.backend.loadPlan(planId)
    if (!stored) {
      throw new Error(`Plan ${planId} not found`)
    }

    const currentRevision = stored.plan.revision ?? 0
    if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
      return {
        ok: false,
        error: {
          code: 'conflict',
          message: `Plan ${planId} changed before deletion was applied`,
          latest: stored.plan,
        },
      }
    }

    await this.backend.deletePlan(planId)
    return { ok: true, value: stored.plan }
  }
}

export const localRepository = new LocalRepository()
