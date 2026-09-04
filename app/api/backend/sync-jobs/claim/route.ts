import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'

const STALE_LOCK_MINUTES = 10

async function authenticate() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function POST(): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response

  const staleBefore = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000).toISOString()
  const { data: candidate, error: candidateError } = await auth.supabase!
    .from('sync_jobs')
    .select('id, attempts')
    .eq('user_id', auth.user!.id)
    .or(`status.eq.queued,and(status.eq.running,locked_at.lt.${staleBefore})`)
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (candidateError) return NextResponse.json({ error: 'Unable to find a sync job' }, { status: 500 })
  if (!candidate) return new Response(null, { status: 204 })

  const { data: claimed, error: claimError } = await auth.supabase!
    .from('sync_jobs')
    .update({ status: 'running', locked_at: new Date().toISOString(), attempts: candidate.attempts + 1 })
    .eq('id', candidate.id)
    .eq('user_id', auth.user!.id)
    .or(`status.eq.queued,and(status.eq.running,locked_at.lt.${staleBefore})`)
    .select('id, kind, idempotency_key, payload_json, status, attempts, available_at, locked_at, completed_at, last_error, created_at, updated_at')
    .maybeSingle()
  if (claimError) return NextResponse.json({ error: 'Unable to claim sync job' }, { status: 500 })
  if (!claimed) return new Response(null, { status: 204 })
  return NextResponse.json({ job: claimed }, { status: 200 })
}
