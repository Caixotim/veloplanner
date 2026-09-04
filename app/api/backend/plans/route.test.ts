/** @jest-environment node */

import { GET } from './route'
import { getSupabaseServerClient } from '../../../lib/supabase/server'

jest.mock('../../../lib/supabase/server', () => ({
  getSupabaseServerClient: jest.fn(),
}))

describe('plans API authentication', () => {
  it('rejects unauthenticated reads', async () => {
    jest.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never)

    const response = await GET()
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' })
  })
})
