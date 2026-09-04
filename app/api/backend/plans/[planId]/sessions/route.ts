import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../../lib/supabase/server'

type Context = { params: Promise<{ planId: string }> }

async function auth() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

async function ownsPlan(supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, planId: string, userId: string) {
  const { data } = await supabase.from('plans').select('id').eq('id', planId).eq('user_id', userId).maybeSingle()
  return Boolean(data)
}

export async function GET(_request: Request, context: Context) {
  const session = await auth()
  if (session.response) return session.response
  const { planId } = await context.params
  if (!await ownsPlan(session.supabase!, planId, session.user!.id)) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  const { data, error } = await session.supabase!.from('sessions').select('*').eq('plan_id', planId).eq('user_id', session.user!.id).order('session_date')
  if (error) return NextResponse.json({ error: 'Unable to load sessions' }, { status: 500 })
  return NextResponse.json({ sessions: data })
}

export async function POST(request: Request, context: Context) {
  const session = await auth()
  if (session.response) return session.response
  const { planId } = await context.params
  if (!await ownsPlan(session.supabase!, planId, session.user!.id)) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  let body: { id?: unknown; date?: unknown; session?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  if (body.session !== undefined && (typeof body.session !== 'object' || body.session === null || Array.isArray(body.session))) return NextResponse.json({ error: 'session must be an object' }, { status: 400 })
  const { data, error } = await session.supabase!.from('sessions').insert({ id: body.id, plan_id: planId, user_id: session.user!.id, session_date: body.date, session_json: body.session ?? {} }).select('*').single()
  if (error) return NextResponse.json({ error: 'Unable to create session' }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}