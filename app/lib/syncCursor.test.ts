import { getSuccessfulSyncCursor, getSyncSince, SYNC_CURSOR_OVERLAP_MS } from './syncCursor'

describe('sync cursor rules', () => {
  it('starts from the beginning when there is no successful cursor', () => {
    expect(getSyncSince(0, 1_000_000)).toBe(0)
  })

  it('requests an overlap before the last successful cursor', () => {
    expect(getSyncSince(20 * 60 * 1000, 30 * 60 * 1000)).toBe(15 * 60 * 1000)
    expect(SYNC_CURSOR_OVERLAP_MS).toBe(5 * 60 * 1000)
  })

  it('never advances the cursor after a failed request', () => {
    const previousCursor = 20 * 60 * 1000
    expect(previousCursor).toBe(20 * 60 * 1000)
  })

  it('advances to the provider watermark after success', () => {
    expect(getSuccessfulSyncCursor(20 * 60 * 1000, 25 * 60 * 1000, 30 * 60 * 1000)).toBe(25 * 60 * 1000)
  })

  it('does not move backwards when the provider watermark is stale', () => {
    expect(getSuccessfulSyncCursor(25 * 60 * 1000, 20 * 60 * 1000, 30 * 60 * 1000)).toBe(25 * 60 * 1000)
  })

  it('uses the request time when the successful response has no watermark', () => {
    expect(getSuccessfulSyncCursor(20 * 60 * 1000, undefined, 30 * 60 * 1000)).toBe(30 * 60 * 1000)
  })

  it('preserves the cursor when an empty response has no provider watermark', () => {
    const previousCursor = 20 * 60 * 1000
    expect(getSuccessfulSyncCursor(previousCursor, previousCursor, 30 * 60 * 1000)).toBe(previousCursor)
  })
})
