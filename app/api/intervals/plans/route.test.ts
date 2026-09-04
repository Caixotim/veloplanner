import { isPlanSyncRequest } from './route'

describe('plan sync request contract', () => {
  it('requires an allowed mode and plan object', () => {
    expect(isPlanSyncRequest({})).toBe(false)
    expect(isPlanSyncRequest({ mode: 'publish', plan: { id: 'plan-1', weeks: [] } })).toBe(false)
    expect(isPlanSyncRequest({ mode: 'upsert', plan: { id: 'plan-1', weeks: [] } })).toBe(true)
  })

  it('rejects empty or non-string plan IDs', () => {
    expect(isPlanSyncRequest({ mode: 'upsert', plan: { id: '', weeks: [] } })).toBe(false)
    expect(isPlanSyncRequest({ mode: 'upsert', plan: { id: 42, weeks: [] } })).toBe(false)
  })

  it('requires plan weeks to be an array', () => {
    expect(isPlanSyncRequest({ mode: 'delete', plan: { id: 'plan-1' } })).toBe(false)
    expect(isPlanSyncRequest({ mode: 'delete', plan: { id: 'plan-1', weeks: [] } })).toBe(true)
  })
})
