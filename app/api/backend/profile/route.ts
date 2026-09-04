import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../lib/supabase/server'
import { normalizeTimezone } from '../../../lib/timezone'

type ProfilePayload = { timezone?: unknown; profile?: unknown }

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function authenticatedClient() {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase: null, user: null, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  return { supabase, user, response: null }
}

export async function GET() {
  const auth = await authenticatedClient()
  if (auth.response) return auth.response
  const { data, error } = await auth.supabase!.from('athlete_profiles').select('*').eq('user_id', auth.user!.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 })
  return NextResponse.json({ profile: data })
}

export async function PUT(request: Request) {
  const auth = await authenticatedClient()
  if (auth.response) return auth.response
  let payload: ProfilePayload
  try { payload = await request.json() as ProfilePayload } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (payload.timezone !== undefined && typeof payload.timezone !== 'string') return NextResponse.json({ error: 'timezone must be a string' }, { status: 400 })
  if (payload.profile !== undefined && !isJsonObject(payload.profile)) return NextResponse.json({ error: 'profile must be an object' }, { status: 400 })

  const { data, error } = await auth.supabase!.from('athlete_profiles').upsert({
    user_id: auth.user!.id,
    ...(payload.timezone === undefined ? {} : { timezone: normalizeTimezone(payload.timezone) }),
    ...(payload.profile === undefined ? {} : { profile_json: payload.profile }),
  }).select('*').single()
  if (error) return NextResponse.json({ error: 'Unable to save profile' }, { status: 500 })
  return NextResponse.json({ profile: data })
}