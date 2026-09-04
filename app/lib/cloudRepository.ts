import type { TrainingPlan, TrainingSession, UserProfile } from './types'
import { hydrateTrainingPlanDates } from './planDateHydration'
import { formatDateInTimezone } from './timezone'
import type { StoredPlan } from './storage'
import { storage } from './storage'
import type { PlanRepository, PlanWrite, RepositoryResult, SessionWrite } from './repository'

type CloudPlanRow = {
  id: string
  plan_json?: unknown
  revision?: number
  created_at?: string
  updated_at?: string
}

type ApiResponse<T> = { plan?: T; plans?: T[]; profile?: T; error?: string }

type CloudSessionRow = { id: string; session_date: string; session_json?: unknown }

async function mirrorPlan(plan: TrainingPlan): Promise<void> {
  try {
    const existing = await storage.loadPlan(plan.id)
    await storage.cachePlan({
      id: plan.id,
      plan,
      originalPlan: existing?.originalPlan ?? plan,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      edits: existing?.edits ?? [],
      isModified: existing?.isModified ?? false,
    })
  } catch (error) {
    console.warn('Unable to mirror cloud plan into local cache', { planId: plan.id, error })
  }
}

function planFromRow(row: CloudPlanRow): TrainingPlan {
  if (!row.plan_json || typeof row.plan_json !== 'object' || Array.isArray(row.plan_json)) {
    throw new Error(`Cloud plan ${row.id} has no valid plan payload`)
  }
  const plan = hydrateTrainingPlanDates({ ...(row.plan_json as TrainingPlan), id: row.id, revision: row.revision ?? 0 })
  if (!plan) throw new Error(`Cloud plan ${row.id} could not be hydrated`)
  return plan
}

function storedFromRow(row: CloudPlanRow): StoredPlan {
  const plan = planFromRow(row)
  const timestamp = row.updated_at ? Date.parse(row.updated_at) : Date.now()
  return { id: row.id, plan, originalPlan: plan, createdAt: row.created_at ? Date.parse(row.created_at) : timestamp, updatedAt: timestamp, edits: [], isModified: false }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, credentials: 'same-origin' })
  const body = await response.json() as ApiResponse<T>
  if (!response.ok) throw new Error(body.error ?? `Cloud request failed (${response.status})`)
  return body as T
}

export class CloudRepository implements PlanRepository {
  constructor(private readonly mirrorCache = true) {}

  async loadProfile(): Promise<UserProfile | undefined> {
    const body = await request<{ profile: { profile_json?: UserProfile } | null }>('/api/backend/profile')
    const profile = body.profile?.profile_json
    if (profile && this.mirrorCache) {
      try { await storage.saveProfile(profile) } catch (error) { console.warn('Unable to mirror cloud profile into local cache', { error }) }
    }
    return profile
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await request('/api/backend/profile', { method: 'PUT', body: JSON.stringify({ timezone: profile.timezone, profile }) })
    if (this.mirrorCache) {
      try { await storage.saveProfile(profile) } catch (error) { console.warn('Unable to mirror cloud profile into local cache', { error }) }
    }
  }

  async listPlans(): Promise<StoredPlan[]> {
    const body = await request<{ plans: CloudPlanRow[] }>('/api/backend/plans')
    const plans = (body.plans ?? []).map(storedFromRow)
    if (this.mirrorCache) await Promise.all(plans.map(({ plan }) => mirrorPlan(plan)))
    return plans
  }

  async loadPlan(planId: string): Promise<StoredPlan | undefined> {
    const response = await fetch(`/api/backend/plans/${encodeURIComponent(planId)}`, { credentials: 'same-origin' })
    if (response.status === 404) return undefined
    const body = await response.json() as ApiResponse<CloudPlanRow>
    if (!response.ok || !body.plan) throw new Error(body.error ?? `Cloud request failed (${response.status})`)
    const stored = storedFromRow(body.plan)
    if (this.mirrorCache) await mirrorPlan(stored.plan)
    return stored
  }

  async createPlan(plan: TrainingPlan): Promise<void> {
    await request('/api/backend/plans', { method: 'POST', body: JSON.stringify({ id: plan.id, name: plan.name, goal: plan.goal, startDate: formatDateInTimezone(plan.startDate, plan.timezone ?? 'UTC'), desiredWeeks: plan.durationWeeks, plan }) })
    if (this.mirrorCache) await mirrorPlan(plan)
  }

  async listSessions(planId: string): Promise<TrainingSession[]> {
    const body = await request<{ sessions: CloudSessionRow[] }>(`/api/backend/plans/${encodeURIComponent(planId)}/sessions`)
    return (body.sessions ?? []).flatMap((row) => {
      if (!row.session_json || typeof row.session_json !== 'object' || Array.isArray(row.session_json)) return []
      const session = row.session_json as TrainingSession
      return [{ ...session, id: row.id, date: new Date(`${row.session_date}T00:00:00.000Z`) }]
    })
  }

  async createSession({ planId, session, timezone }: SessionWrite): Promise<void> {
    await request(`/api/backend/plans/${encodeURIComponent(planId)}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ id: session.id, date: formatDateInTimezone(session.date, timezone ?? 'UTC'), session }),
    })
  }

  async updatePlan({ plan, expectedRevision }: PlanWrite): Promise<RepositoryResult<TrainingPlan>> {
    const response = await fetch('/api/backend/plans/' + encodeURIComponent(plan.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: expectedRevision ?? plan.revision ?? 0, name: plan.name, goal: plan.goal, status: plan.status, plan }), credentials: 'same-origin' })
    const body = await response.json() as ApiResponse<CloudPlanRow>
    if (response.status === 409) {
      const latest = body.plan ? planFromRow(body.plan) : undefined
      if (latest) return { ok: false, error: { code: 'conflict', message: body.error ?? 'Plan changed before this update was applied', latest } }
    }
    if (!response.ok || !body.plan) throw new Error(body.error ?? `Cloud request failed (${response.status})`)
    const savedPlan = planFromRow(body.plan)
    if (this.mirrorCache) await mirrorPlan(savedPlan)
    return { ok: true, value: savedPlan }
  }

  async deletePlan(planId: string, expectedRevision?: number): Promise<RepositoryResult<TrainingPlan>> {
    const current = await this.loadPlan(planId)
    if (!current) throw new Error(`Plan ${planId} not found`)
    const response = await fetch(`/api/backend/plans/${encodeURIComponent(planId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: expectedRevision === undefined ? undefined : JSON.stringify({ expectedRevision }), credentials: 'same-origin' })
    if (response.status === 409) return { ok: false, error: { code: 'conflict', message: 'Plan changed before deletion was applied', latest: current.plan } }
    if (!response.ok) throw new Error(`Cloud request failed (${response.status})`)
    if (this.mirrorCache) {
      try { await storage.deletePlan(planId) } catch (error) { console.warn('Unable to remove deleted cloud plan from local cache', { planId, error }) }
    }
    return { ok: true, value: current.plan }
  }
}

export const cloudRepository = new CloudRepository()
export const migrationCloudRepository = new CloudRepository(false)
