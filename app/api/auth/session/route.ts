import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/app/lib/supabase/server'

export async function GET(): Promise<Response> {
  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    return NextResponse.json({ user: data.user })
  } catch {
    return NextResponse.json({ user: null, configured: false }, { status: 200 })
  }
}
