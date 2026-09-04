import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/app/lib/supabase/server'

export async function POST(): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      return NextResponse.json({ error: 'Unable to sign out' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
