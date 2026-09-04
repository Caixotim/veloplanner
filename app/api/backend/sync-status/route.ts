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

  const [connection, jobs, cursors] = await Promise.all([
    auth.supabase!.from('intervals_connections').select('athlete_id, expires_at, updated_at').eq('user_id', auth.user!.id).maybeSingle(),
    auth.supabase!.from('sync_jobs').select('id, kind, status, attempts, available_at, completed_at, last_error, updated_at').eq('user_id', auth.user!.id).order('created_at', { ascending: false }).limit(20),
    auth.supabase!.from('sync_cursors').select('provider, cursor, updated_at').eq('user_id', auth.user!.id),
  ])
  if (connection.error || jobs.error || cursors.error) return NextResponse.json({ error: 'Unable to load sync status' }, { status: 500 })

  return NextResponse.json({
    connection: connection.data,
    jobs: jobs.data,
    cursors: cursors.data,
  })
}
