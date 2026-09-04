import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'

type JobStatus = 'succeeded' | 'failed'

type StatusRequest = {
  status?: unknown
  error?: unknown
  retryAt?: unknown
}

async function authenticate() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response
  const { jobId } = await context.params

  let body: StatusRequest
  try { body = await request.json() as StatusRequest } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (body.status !== 'succeeded' && body.status !== 'failed') return NextResponse.json({ error: 'status must be succeeded or failed' }, { status: 400 })
  if (body.error !== undefined && typeof body.error !== 'string') return NextResponse.json({ error: 'error must be a string' }, { status: 400 })
  if (body.retryAt !== undefined && (typeof body.retryAt !== 'string' || Number.isNaN(Date.parse(body.retryAt)))) return NextResponse.json({ error: 'retryAt must be an ISO date' }, { status: 400 })

  const completed = body.status === 'succeeded'
  const update = completed
    ? { status: 'succeeded', completed_at: new Date().toISOString(), locked_at: null, last_error: null }
    : { status: body.retryAt ? 'queued' : 'failed', available_at: body.retryAt ?? new Date().toISOString(), locked_at: null, last_error: body.error ?? 'Sync job failed' }

  const { data, error } = await auth.supabase!
    .from('sync_jobs')
    .update(update)
    .eq('id', jobId)
    .eq('user_id', auth.user!.id)
    .eq('status', 'running')
    .select('id, kind, idempotency_key, payload_json, status, attempts, available_at, locked_at, completed_at, last_error, created_at, updated_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to update sync job' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Running sync job not found' }, { status: 404 })
  return NextResponse.json({ job: data })
}
