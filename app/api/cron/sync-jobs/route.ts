import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '../../../lib/supabase/admin'
import { getIntervalsConfigForUser } from '../../intervals/serverConfig'
import { POST as syncRides } from '../../intervals/rides/route'
import { POST as syncPlan } from '../../intervals/plans/route'

export const maxDuration = 120
const MAX_JOBS_PER_RUN = 10

type Job = { id: string; user_id: string; kind: 'intervals_rides' | 'intervals_plan'; payload_json: Record<string, unknown>; attempts: number }

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data: jobs, error } = await supabase
    .from('sync_jobs')
    .select('id, user_id, kind, payload_json, attempts')
    .eq('status', 'queued')
    .lte('available_at', now)
    .order('created_at', { ascending: true })
    .limit(MAX_JOBS_PER_RUN)
  if (error) return NextResponse.json({ error: 'Unable to load queued jobs' }, { status: 500 })

  let succeeded = 0
  let failed = 0
  for (const candidate of (jobs ?? []) as Job[]) {
    const lockedAt = new Date().toISOString()
    const { data: job } = await supabase.from('sync_jobs').update({ status: 'running', locked_at: lockedAt, attempts: candidate.attempts + 1 }).eq('id', candidate.id).eq('status', 'queued').select('id, user_id, kind, payload_json, attempts').maybeSingle<Job>()
    if (!job) continue
    try {
      const config = await getIntervalsConfigForUser(job.user_id, supabase)
      if (!config) throw new Error('Intervals connection missing')
      const headers = new Headers({ 'Content-Type': 'application/json', 'x-intervals-api-key': config.apiKey, 'x-intervals-athlete-id': config.athleteId })
      const target = new URL(job.kind === 'intervals_rides' ? '/api/intervals/rides' : '/api/intervals/plans', request.url)
      const response = await (job.kind === 'intervals_rides' ? syncRides : syncPlan)(new Request(target, { method: 'POST', headers, body: JSON.stringify(job.payload_json) }))
      const result = await response.clone().json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!response.ok || result.success === false) throw new Error(result.error ?? `Sync failed (${response.status})`)
      await supabase.from('sync_jobs').update({ status: 'succeeded', completed_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', job.id)
      succeeded++
    } catch (jobError) {
      const message = jobError instanceof Error ? jobError.message : 'Sync job failed'
      const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 2 ** Math.min(job.attempts, 8) * 1_000)).toISOString()
      await supabase.from('sync_jobs').update({ status: 'queued', available_at: retryAt, locked_at: null, last_error: message }).eq('id', job.id)
      failed++
    }
  }
  return NextResponse.json({ processed: succeeded + failed, succeeded, failed })
}
