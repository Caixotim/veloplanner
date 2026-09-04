import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'
import { POST as syncRides } from '../../../intervals/rides/route'
import { POST as syncPlan } from '../../../intervals/plans/route'

const STALE_LOCK_MINUTES = 10

type Job = { id: string; kind: 'intervals_rides' | 'intervals_plan'; payload_json: Record<string, unknown>; attempts: number }
type SyncLink = { sessionId: string; eventId?: number; externalId?: string }

async function authenticate() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response

  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000).toISOString()
  const { data: candidate, error: findError } = await auth.supabase!
    .from('sync_jobs')
    .select('id, kind, payload_json, attempts')
    .eq('user_id', auth.user!.id)
    .or(`status.eq.queued,and(status.eq.running,locked_at.lt.${staleBefore})`)
    .lte('available_at', now)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (findError) return NextResponse.json({ error: 'Unable to find a sync job' }, { status: 500 })
  if (!candidate) return new Response(null, { status: 204 })

  const { data: job, error: claimError } = await auth.supabase!
    .from('sync_jobs')
    .update({ status: 'running', locked_at: now, attempts: candidate.attempts + 1 })
    .eq('id', candidate.id)
    .eq('user_id', auth.user!.id)
    .or(`status.eq.queued,and(status.eq.running,locked_at.lt.${staleBefore})`)
    .select('id, kind, payload_json, attempts')
    .maybeSingle<Job>()
  if (claimError) return NextResponse.json({ error: 'Unable to claim sync job' }, { status: 500 })
  if (!job) return new Response(null, { status: 204 })

  try {
    const cookie = request.headers.get('cookie') ?? ''
    const headers = new Headers({ 'Content-Type': 'application/json', cookie })
    const payload = job.payload_json ?? {}
    const response = job.kind === 'intervals_rides'
      ? await syncRides(new Request(new URL('/api/intervals/rides', request.url), { method: 'POST', headers, body: JSON.stringify(payload) }))
      : await syncPlan(new Request(new URL('/api/intervals/plans', request.url), { method: 'POST', headers, body: JSON.stringify(payload) }))
    const result = await response.clone().json().catch(() => ({})) as { success?: boolean; error?: string; nextCursor?: number; syncedLinks?: SyncLink[] }
    if (!response.ok || result.success === false) throw new Error(result.error ?? `Intervals sync failed (${response.status})`)

    if (job.kind === 'intervals_rides' && typeof result.nextCursor === 'number' && Number.isFinite(result.nextCursor)) {
      const { error: cursorError } = await auth.supabase!
        .from('sync_cursors')
        .upsert({ user_id: auth.user!.id, provider: 'intervals', cursor: String(result.nextCursor), updated_at: new Date().toISOString() })
      if (cursorError) throw new Error('Sync succeeded but cursor persistence failed')
    }

    if (job.kind === 'intervals_plan' && result.syncedLinks?.length) {
      const links = result.syncedLinks
        .filter((link) => typeof link.sessionId === 'string' && (typeof link.eventId === 'number' || typeof link.externalId === 'string'))
        .map((link) => ({
          session_id: link.sessionId,
          user_id: auth.user!.id,
          intervals_event_id: link.eventId === undefined ? null : String(link.eventId),
          intervals_external_id: link.externalId ?? null,
          last_synced_at: new Date().toISOString(),
        }))
      if (links.length) {
        const { error: linkError } = await auth.supabase!.from('sync_links').upsert(links, { onConflict: 'session_id' })
        if (linkError) throw new Error('Sync succeeded but link persistence failed')
      }
    }

    await auth.supabase!.from('sync_jobs').update({ status: 'succeeded', completed_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', job.id).eq('user_id', auth.user!.id)
    return NextResponse.json({ jobId: job.id, success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync job failed'
    const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 2 ** Math.min(job.attempts, 8) * 1_000)).toISOString()
    await auth.supabase!.from('sync_jobs').update({ status: 'queued', available_at: retryAt, locked_at: null, last_error: message }).eq('id', job.id).eq('user_id', auth.user!.id)
    return NextResponse.json({ jobId: job.id, success: false, retryAt, error: message }, { status: 502 })
  }
}
