import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '../../../../../lib/supabase/server'

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const supabase = await getSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { jobId } = await context.params
  const { data, error } = await supabase
    .from('sync_jobs')
    .update({ status: 'queued', available_at: new Date().toISOString(), locked_at: null, last_error: null })
    .eq('id', jobId)
    .eq('user_id', user.id)
    .eq('status', 'failed')
    .select('id, kind, status, attempts, available_at, last_error, updated_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to retry sync job' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Failed sync job not found' }, { status: 404 })
  return NextResponse.json({ job: data })
}
