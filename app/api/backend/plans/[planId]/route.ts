import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'

type Context = { params: Promise<{ planId: string }> }

async function auth() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function GET(_request: Request, context: Context) {
  const session = await auth()
  if (session.response) return session.response
  const { planId } = await context.params
  const { data, error } = await session.supabase!.from('plans').select('*, sessions(*)').eq('id', planId).eq('user_id', session.user!.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load plan' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  return NextResponse.json({ plan: data })
}

export async function PUT(request: Request, context: Context) {
  const session = await auth()
  if (session.response) return session.response
  const { planId } = await context.params
  let body: { expectedRevision?: unknown; name?: unknown; goal?: unknown; status?: unknown; plan?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) return NextResponse.json({ error: 'expectedRevision is required' }, { status: 400 })
  const patch = {
    ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
    ...(typeof body.goal === 'string' ? { goal: body.goal.trim() } : {}),
    ...(body.status === 'draft' || body.status === 'active' || body.status === 'archived' ? { status: body.status } : {}),
    ...(body.plan && typeof body.plan === 'object' && !Array.isArray(body.plan) ? { plan_json: body.plan } : {}),
    revision: (body.expectedRevision as number) + 1,
  }
  const { data, error } = await session.supabase!.from('plans').update(patch).eq('id', planId).eq('user_id', session.user!.id).eq('revision', body.expectedRevision).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to update plan' }, { status: 500 })
  if (!data) {
    const { data: latest } = await session.supabase!.from('plans').select('*').eq('id', planId).eq('user_id', session.user!.id).maybeSingle()
    if (!latest) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    return NextResponse.json({ error: 'Plan revision conflict', plan: latest }, { status: 409 })
  }
  return NextResponse.json({ plan: data })
}

export async function DELETE(_request: Request, context: Context) {
  const session = await auth()
  if (session.response) return session.response
  const { planId } = await context.params
  let expectedRevision: number | undefined
  try {
    const body = await _request.json() as { expectedRevision?: unknown }
    if (body.expectedRevision !== undefined) {
      if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 })
      expectedRevision = body.expectedRevision as number
    }
  } catch {
    // An empty DELETE body is valid when no revision guard is requested.
  }
  let query = session.supabase!.from('plans').delete({ count: 'exact' }).eq('id', planId).eq('user_id', session.user!.id)
  if (expectedRevision !== undefined) query = query.eq('revision', expectedRevision)
  const { error, count } = await query
  if (error) return NextResponse.json({ error: 'Unable to delete plan' }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  return new Response(null, { status: 204 })
}