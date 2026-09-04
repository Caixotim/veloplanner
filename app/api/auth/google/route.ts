import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/app/lib/supabase/server'

export async function GET(request: Request): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient()
    const redirectTo = new URL('/api/auth/callback', request.url)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    })

    if (error || !data.url) {
      return NextResponse.json({ error: error?.message || 'Unable to start Google sign-in' }, { status: 502 })
    }

    return NextResponse.redirect(data.url)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authentication is not configured' },
      { status: 503 }
    )
  }
}
