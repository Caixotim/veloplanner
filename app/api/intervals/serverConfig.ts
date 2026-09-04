import { getSupabaseServerClient } from '../../lib/supabase/server'
import { decryptSecret } from '../../lib/serverSecret'
import { getIntervalsConfig, type IntervalsConfig } from './_utils'
import { getSupabaseAdminClient } from '../../lib/supabase/admin'

/**
 * Resolve the authenticated athlete's Intervals credential without exposing it
 * to the browser. Returns null for anonymous/local-mode requests.
 */
export async function getAuthenticatedIntervalsConfig(): Promise<IntervalsConfig | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null

  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return null

    return getIntervalsConfigForUser(user.id, supabase)
  } catch (error) {
    console.warn('Unable to resolve authenticated Intervals connection', { error })
    return null
  }
}

export async function getIntervalsConfigForUser(userId: string, client = getSupabaseAdminClient()): Promise<IntervalsConfig | null> {
  const { data, error } = await client
    .from('intervals_connections')
    .select('athlete_id, encrypted_access_token')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.athlete_id || !data.encrypted_access_token) return null
  return getIntervalsConfig({ athleteId: data.athlete_id, apiKey: decryptSecret(data.encrypted_access_token) })
}
