import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../lib/supabase/server'

type JobKind = 'intervals_rides' | 'intervals_plan'

type JobRequest = {
  kind?: unknown
  idempotencyKey?: unknown
  payload?: unknown
}

async function authenticate() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { supabase, user, response: null }
}

function isJobKind(value: unknown): value is JobKind {
  return value === 'intervals_rides' || value === 'intervals_plan'
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function GET(): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response

  const { data, error } = await auth.supabase!
    .from('sync_jobs')
    .select('id, kind, idempotency_key, payload_json, status, attempts, available_at, locked_at, completed_at, last_error, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Unable to load sync jobs' }, { status: 500 })
  return NextResponse.json({ jobs: data })
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response

  let body: JobRequest
  try { body = await request.json() as JobRequest } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!isJobKind(body.kind)) return NextResponse.json({ error: 'kind is invalid' }, { status: 400 })
  if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 })
  if (body.payload !== undefined && !isJsonObject(body.payload)) return NextResponse.json({ error: 'payload must be an object' }, { status: 400 })

  const idempotencyKey = body.idempotencyKey.trim()
  const { data: existing, error: existingError } = await auth.supabase!
    .from('sync_jobs')
    .select('id, kind, idempotency_key, payload_json, status, attempts, available_at, locked_at, completed_at, last_error, created_at, updated_at')
    .eq('user_id', auth.user!.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: 'Unable to inspect existing sync job' }, { status: 500 })
  if (existing) return NextResponse.json({ job: existing }, { status: 200 })

  const { data, error } = await auth.supabase!
    .from('sync_jobs')
    .insert({
      user_id: auth.user!.id,
      kind: body.kind,
      idempotency_key: idempotencyKey,
      payload_json: body.payload ?? {},
      status: 'queued',
      available_at: new Date().toISOString(),
    })
    .select('id, kind, idempotency_key, payload_json, status, attempts, available_at, locked_at, completed_at, last_error, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: 'Unable to enqueue sync job' }, { status: 500 })
  return NextResponse.json({ job: data }, { status: 202 })
}
