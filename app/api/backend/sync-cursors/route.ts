import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../lib/supabase/server'

async function authenticate() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function GET(): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response
  const { data, error } = await auth.supabase!.from('sync_cursors').select('provider, cursor, updated_at').eq('user_id', auth.user!.id)
  if (error) return NextResponse.json({ error: 'Unable to load sync cursors' }, { status: 500 })
  return NextResponse.json({ cursors: data })
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await authenticate()
  if (auth.response) return auth.response
  let body: { provider?: unknown; cursor?: unknown }
  try { body = await request.json() as { provider?: unknown; cursor?: unknown } } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (body.provider !== 'intervals') return NextResponse.json({ error: 'provider must be intervals' }, { status: 400 })
  if (typeof body.cursor !== 'string' || !body.cursor.trim()) return NextResponse.json({ error: 'cursor is required' }, { status: 400 })

  const { data, error } = await auth.supabase!
    .from('sync_cursors')
    .upsert({ user_id: auth.user!.id, provider: body.provider, cursor: body.cursor.trim(), updated_at: new Date().toISOString() })
    .select('provider, cursor, updated_at')
    .single()
  if (error) return NextResponse.json({ error: 'Unable to save sync cursor' }, { status: 500 })
  return NextResponse.json({ cursor: data })
}
