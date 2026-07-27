import { NextResponse } from 'next/server'


export async function GET(): Promise<Response> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010'

  const response = NextResponse.redirect(`${appUrl}?oauth_success=true&provider=intervals`)
  response.cookies.set('intervals_connected', 'true', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return response
}
