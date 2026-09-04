import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../lib/supabase/server'

type PlanPayload = {
  id?: unknown
  name?: unknown
  goal?: unknown
  startDate?: unknown
  desiredWeeks?: unknown
  plan?: unknown
}

async function getAuthenticatedClient() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function GET() {
  const auth = await getAuthenticatedClient()
  if (auth.response) return auth.response
  const { data, error } = await auth.supabase!.from('plans').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load plans' }, { status: 500 })
  return NextResponse.json({ plans: data })
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient()
  if (auth.response) return auth.response

  let payload: PlanPayload
  try { payload = await request.json() as PlanPayload } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (typeof payload.name !== 'string' || !payload.name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (typeof payload.goal !== 'string' || !payload.goal.trim()) return NextResponse.json({ error: 'goal is required' }, { status: 400 })
  if (!isCalendarDate(payload.startDate)) return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 })
  if (!Number.isInteger(payload.desiredWeeks) || (payload.desiredWeeks as number) < 1) return NextResponse.json({ error: 'desiredWeeks must be a positive integer' }, { status: 400 })
  if (payload.plan !== undefined && !isJsonObject(payload.plan)) return NextResponse.json({ error: 'plan must be an object' }, { status: 400 })

  const { data, error } = await auth.supabase!.from('plans').insert({
    ...(typeof payload.id === 'string' && payload.id ? { id: payload.id } : {}),
    user_id: auth.user!.id,
    name: payload.name.trim(),
    goal: payload.goal.trim(),
    start_date: payload.startDate,
    desired_weeks: payload.desiredWeeks,
    plan_json: payload.plan ?? {},
  }).select('*').single()
  if (error) return NextResponse.json({ error: 'Unable to create plan' }, { status: 500 })
  return NextResponse.json({ plan: data }, { status: 201 })
}