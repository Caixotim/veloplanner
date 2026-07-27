import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'


export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies()
    const isConnectedCookie = cookieStore.get('intervals_connected')?.value === 'true'
    const isConfigured = isConnectedCookie
    const isAuthenticated = isConnectedCookie

    return Response.json({
      accessToken: isAuthenticated ? 'intervals_connected' : null,
      refreshToken: null,
      isAuthenticated,
      isConfigured,
    })
  } catch (error) {
    console.error('Failed to get Intervals auth state', { error })
    return Response.json({ error: 'Failed to retrieve Intervals auth state' }, { status: 500 })
  }
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ success: true })

  response.cookies.set('intervals_connected', 'false', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })

  return response
}
