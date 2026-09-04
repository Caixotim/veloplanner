import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../lib/supabase/server'
import { encryptSecret } from '../../../../lib/serverSecret'

async function auth() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function GET() {
  const session = await auth()
  if (session.response) return session.response
  const { data, error } = await session.supabase!.from('intervals_connections').select('user_id, athlete_id, expires_at, updated_at').eq('user_id', session.user!.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load Intervals connection' }, { status: 500 })
  return NextResponse.json({ connection: data })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (session.response) return session.response
  let body: { athleteId?: unknown; accessToken?: unknown; refreshToken?: unknown; expiresAt?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (typeof body.athleteId !== 'string' || !body.athleteId.trim()) return NextResponse.json({ error: 'athleteId is required' }, { status: 400 })
  if (typeof body.accessToken !== 'string' || !body.accessToken) return NextResponse.json({ error: 'accessToken is required' }, { status: 400 })
  if (body.refreshToken !== undefined && typeof body.refreshToken !== 'string') return NextResponse.json({ error: 'refreshToken must be a string' }, { status: 400 })

  let encryptedAccessToken: string
  let encryptedRefreshToken: string | null = null
  try {
    encryptedAccessToken = encryptSecret(body.accessToken)
    if (body.refreshToken) encryptedRefreshToken = encryptSecret(body.refreshToken)
  } catch {
    return NextResponse.json({ error: 'Token encryption is not configured' }, { status: 503 })
  }
  const { error } = await session.supabase!.from('intervals_connections').upsert({ user_id: session.user!.id, athlete_id: body.athleteId.trim(), encrypted_access_token: encryptedAccessToken, encrypted_refresh_token: encryptedRefreshToken, expires_at: body.expiresAt ?? null })
  if (error) return NextResponse.json({ error: 'Unable to save Intervals connection' }, { status: 500 })
  return NextResponse.json({ connected: true })
}

export async function DELETE() {
  const session = await auth()
  if (session.response) return session.response
  const { error } = await session.supabase!.from('intervals_connections').delete().eq('user_id', session.user!.id)
  if (error) return NextResponse.json({ error: 'Unable to disconnect Intervals' }, { status: 500 })
  return new Response(null, { status: 204 })
}
