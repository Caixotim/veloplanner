'use client'

import { storage } from './storage'

type SessionResponse = { user: { id: string } | null; configured?: boolean }
type ScopeState = { user: { id: string } | null; pendingMigration: boolean }

let initialization: Promise<ScopeState> | undefined
let state: ScopeState = { user: null, pendingMigration: false }
let pendingDecision: Promise<void> | undefined
let resolvePending: (() => void) | undefined

export function initializeAccountScope(): Promise<ScopeState> {
  if (!initialization) {
    initialization = (async () => {
      await storage.setAccountScope()
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      const session = await response.json() as SessionResponse
      if (!session.user || session.configured === false) {
        state = { user: null, pendingMigration: false }
        return state
      }

      const [profile, plans] = await Promise.all([
        storage.loadProfile('active-profile'),
        storage.loadAllPlans(),
      ])
      const marker = window.localStorage.getItem(`account-migration:${session.user.id}`)
      const pendingMigration = Boolean(profile || plans.length) && !marker
      state = { user: session.user, pendingMigration }
      if (pendingMigration) {
        pendingDecision = new Promise<void>((resolve) => { resolvePending = resolve })
      } else {
        await storage.setAccountScope(session.user.id)
      }
      return state
    })().catch((error) => {
      initialization = undefined
      throw error
    })
  }
  return initialization
}

export async function waitForAccountScope(): Promise<ScopeState> {
  const current = await initializeAccountScope()
  if (current.pendingMigration) await pendingDecision
  return state
}

export async function resolveAccountScope(accountId: string, decision: 'import' | 'skip'): Promise<void> {
  const current = await initializeAccountScope()
  if (!current.user || current.user.id !== accountId) return
  window.localStorage.setItem(`account-migration:${accountId}`, decision === 'import' ? 'completed' : 'skipped')
  await storage.setAccountScope(accountId)
  state = { ...current, pendingMigration: false }
  resolvePending?.()
  resolvePending = undefined
  pendingDecision = undefined
}

export function getAccountScopeState(): ScopeState {
  return state
}
