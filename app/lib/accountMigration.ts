import type { PlanRepository } from './repository'
import type { UserProfile } from './types'
import type { StoredPlan } from './storage'

export type MigrationReport = {
  profile: 'imported' | 'skipped'
  plansImported: number
  plansSkipped: number
  sessionsImported: number
  sessionsSkipped: number
  failures: Array<{ kind: 'profile' | 'plan' | 'session'; id?: string; message: string }>
}

export type LocalMigrationSource = {
  loadProfile(): Promise<UserProfile | undefined>
  listPlans(): Promise<StoredPlan[]>
}

/**
 * Imports local data into an authenticated repository. Existing plan IDs are
 * skipped, making retries safe and avoiding accidental duplicate plans.
 */
export async function migrateLocalAccount(source: LocalMigrationSource, target: PlanRepository): Promise<MigrationReport> {
  const report: MigrationReport = { profile: 'skipped', plansImported: 0, plansSkipped: 0, sessionsImported: 0, sessionsSkipped: 0, failures: [] }

  const profile = await source.loadProfile()
  if (profile) {
    try {
      await target.saveProfile(profile)
      report.profile = 'imported'
    } catch (error) {
      report.failures.push({ kind: 'profile', message: error instanceof Error ? error.message : 'Profile import failed' })
    }
  }

  const [localPlans, remotePlans] = await Promise.all([source.listPlans(), target.listPlans()])
  const remoteIds = new Set(remotePlans.map(({ id }) => id))
  for (const stored of localPlans) {
    if (remoteIds.has(stored.id)) {
      report.plansSkipped += 1
      continue
    }
    try {
      await target.createPlan(stored.plan)
      remoteIds.add(stored.id)
      report.plansImported += 1
    } catch (error) {
      report.failures.push({ kind: 'plan', id: stored.id, message: error instanceof Error ? error.message : 'Plan import failed' })
      continue
    }
  }

  for (const stored of localPlans) {
    if (!remoteIds.has(stored.id)) continue
    try {
      const remoteSessionIds = new Set((await target.listSessions(stored.id)).map((session) => session.id))
      for (const session of stored.plan.weeks.flatMap((week) => week.sessions)) {
        const migrationSessionId = `${stored.id}_${session.id}`
        if (remoteSessionIds.has(session.id) || remoteSessionIds.has(migrationSessionId)) {
          report.sessionsSkipped += 1
          continue
        }
        try {
          // Preserve the original ID when possible. If browser-generated IDs
          // collide across local plans, retry with a plan-scoped ID.
          try {
            await target.createSession({ planId: stored.id, session, timezone: stored.plan.timezone })
            remoteSessionIds.add(session.id)
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : ''
            if (!message.includes('already exists') && !message.includes('duplicate') && !message.includes('conflict')) {
              throw error
            }
            await target.createSession({
              planId: stored.id,
              session: { ...session, id: migrationSessionId },
              timezone: stored.plan.timezone,
            })
            remoteSessionIds.add(migrationSessionId)
          }
          report.sessionsImported += 1
        } catch (error) {
          report.failures.push({ kind: 'session', id: session.id, message: error instanceof Error ? error.message : 'Session import failed' })
        }
      }
    } catch (error) {
      report.failures.push({ kind: 'session', id: stored.id, message: error instanceof Error ? error.message : 'Session listing failed' })
    }
  }

  return report
}
