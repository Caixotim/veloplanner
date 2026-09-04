import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'

type Context = { params: Promise<{ sessionId: string }> }

async function getAuth() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function GET(_request: Request, context: Context) {
  const auth = await getAuth()
  if (auth.response) return auth.response
  const { sessionId } = await context.params
  const { data, error } = await auth.supabase!.from('sessions').select('*').eq('id', sessionId).eq('user_id', auth.user!.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load session' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ session: data })
}

export async function PUT(request: Request, context: Context) {
  const auth = await getAuth()
  if (auth.response) return auth.response
  const { sessionId } = await context.params
  let body: { expectedRevision?: unknown; date?: unknown; session?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) return NextResponse.json({ error: 'expectedRevision is required' }, { status: 400 })
  if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  if (body.session !== undefined && (typeof body.session !== 'object' || body.session === null || Array.isArray(body.session))) return NextResponse.json({ error: 'session must be an object' }, { status: 400 })

  const patch = {
    ...(body.date === undefined ? {} : { session_date: body.date }),
    ...(body.session === undefined ? {} : { session_json: body.session }),
    revision: (body.expectedRevision as number) + 1,
  }
  const { data, error } = await auth.supabase!.from('sessions').update(patch).eq('id', sessionId).eq('user_id', auth.user!.id).eq('revision', body.expectedRevision).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to update session' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Session revision conflict or session not found' }, { status: 409 })
  return NextResponse.json({ session: data })
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await getAuth()
  if (auth.response) return auth.response
  const { sessionId } = await context.params
  const { error, count } = await auth.supabase!.from('sessions').delete({ count: 'exact' }).eq('id', sessionId).eq('user_id', auth.user!.id)
  if (error) return NextResponse.json({ error: 'Unable to delete session' }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return new Response(null, { status: 204 })
}