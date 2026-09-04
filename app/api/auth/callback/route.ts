import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/app/lib/supabase/server'

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/?authError=missing_code', request.url))
  }

  try {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL('/?authError=oauth_exchange_failed', request.url))
    }

    return NextResponse.redirect(new URL('/', request.url))
  } catch {
    return NextResponse.redirect(new URL('/?authError=auth_not_configured', request.url))
  }
}
