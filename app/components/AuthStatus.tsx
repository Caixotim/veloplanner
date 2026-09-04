'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '../lib/supabase/browser'

type SessionUser = { email?: string | null; user_metadata?: { full_name?: string; name?: string } }

export function AuthStatus() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (!response.ok) throw new Error('Session request failed')
        const body = (await response.json()) as { user: SessionUser | null; configured?: boolean }
        if (mounted) {
          setConfigured(body.configured !== false)
          setUser(body.user)
        }
      } catch {
        if (mounted) setConfigured(false)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [])

  if (loading || !configured) return null

  if (!user) {
    return <a className="navButton" href="/api/auth/google">Sign in</a>
  }

  const label = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Account'
  return (
    <span className="navButton" title={user.email ?? undefined}>
      {label}
      <button type="button" onClick={() => { void signOut() }}>Sign out</button>
    </span>
  )
}

async function signOut() {
  const supabase = getSupabaseBrowserClient()
  await supabase.auth.signOut()
  window.location.reload()
}
