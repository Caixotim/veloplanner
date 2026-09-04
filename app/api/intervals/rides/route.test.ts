import { isSyncRequest } from './route'

describe('POST /api/intervals/rides', () => {
  it('rejects malformed sync payloads before contacting Intervals', async () => {
    expect(isSyncRequest({ since: -1 })).toBe(false)
  })

  it('rejects non-boolean force refresh values', async () => {
    expect(isSyncRequest({ since: 0, forceRefresh: 'true' })).toBe(false)
  })
})
