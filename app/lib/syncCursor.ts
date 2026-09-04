export const SYNC_CURSOR_OVERLAP_MS = 5 * 60 * 1000

export function getSyncSince(lastSuccessfulCursor: number, now: number): number {
  if (!Number.isFinite(lastSuccessfulCursor) || lastSuccessfulCursor <= 0) {
    return 0
  }

  return Math.max(0, lastSuccessfulCursor - SYNC_CURSOR_OVERLAP_MS)
}

export function getSuccessfulSyncCursor(
  previousCursor: number,
  providerCursor: number | undefined,
  now: number
): number {
  const safePrevious = Number.isFinite(previousCursor) && previousCursor >= 0 ? previousCursor : 0
  const candidate = typeof providerCursor === 'number' && Number.isFinite(providerCursor) && providerCursor >= 0
    ? providerCursor
    : now

  return Math.max(safePrevious, candidate)
}
