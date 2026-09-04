'use client'

import { useEffect, useState } from 'react'
import { migrationCloudRepository } from '../lib/cloudRepository'
import { migrateLocalAccount, type MigrationReport } from '../lib/accountMigration'
import { storage } from '../lib/storage'
import { getAccountScopeState, initializeAccountScope, resolveAccountScope } from '../lib/accountScope'

type User = { id: string }

export function AccountMigrationPrompt() {
  const [user, setUser] = useState<User | null>(null)
  const [hasLocalData, setHasLocalData] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<MigrationReport | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        await initializeAccountScope()
        const scope = getAccountScopeState()
        if (!active || !scope.user) return
        const [profile, plans] = await Promise.all([storage.loadProfile('active-profile'), storage.loadAllPlans()])
        if (active) {
          setUser(scope.user)
          const needsMigration = scope.pendingMigration && Boolean(profile || plans.length)
          setHasLocalData(needsMigration)
        }
      } catch {
        // Migration remains unavailable when Supabase or IndexedDB is unavailable.
      }
    }
    void load()
    return () => { active = false }
  }, [])

  if (!user || !hasLocalData) return null

  const runMigration = async () => {
    setBusy(true)
    try {
      const nextReport = await migrateLocalAccount(
        { loadProfile: () => storage.loadProfile('active-profile'), listPlans: () => storage.loadAllPlans() },
        migrationCloudRepository,
      )
      setReport(nextReport)
      if (nextReport.failures.length === 0) {
        await resolveAccountScope(user.id, 'import')
        setHasLocalData(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="accountMigrationPrompt" role="status">
      <strong>Local training data found</strong>
      {!report ? (
        <>
          <span>Import it into your account for access on other devices?</span>
          <div>
            <button type="button" onClick={() => { void runMigration() }} disabled={busy}>{busy ? 'Importing…' : 'Import data'}</button>
            <button type="button" onClick={() => { void resolveAccountScope(user.id, 'skip'); setHasLocalData(false) }} disabled={busy}>Skip</button>
          </div>
        </>
      ) : (
        <>
          <span>Imported {report.plansImported} plan(s) and {report.sessionsImported} session(s); skipped {report.plansSkipped} plan(s) and {report.sessionsSkipped} session(s). {report.failures.length ? 'Some items need retry.' : 'Migration complete.'}</span>
          {report.failures.length > 0 && (
            <>
              <ul>
                {report.failures.slice(0, 3).map((failure) => <li key={`${failure.kind}-${failure.id ?? 'profile'}`}>{failure.kind}: {failure.message}</li>)}
              </ul>
              <button type="button" onClick={() => { setReport(null); void runMigration() }} disabled={busy}>Retry failed items</button>
            </>
          )}
        </>
      )}
    </aside>
  )
}
