/**
 * Background sync worker for continuous Intervals.icu synchronization
 * This worker runs in the background and periodically syncs data
 */

import { getSuccessfulSyncCursor, getSyncSince } from './syncCursor'
import { createIntervalController, createSingleFlightGate } from './syncLifecycle'

// Types for messaging with main thread
interface SyncStartMessage {
  type: 'SYNC_START'
  interval: number // milliseconds
  apiKey: string
  athleteId: string
  timezone?: string
}

interface SyncStopMessage {
  type: 'SYNC_STOP'
}

interface SyncResultMessage {
  type: 'SYNC_RESULT'
  success: boolean
  newRidesCount: number
  changes: Array<{
    type: string
    label: string
  }>
  rides?: Array<Record<string, unknown>>
  nextCursor?: number
  error?: string
  timestamp: number
}

let lastSyncTime = 0
const syncTimer = createIntervalController(setInterval, clearInterval)
const syncGate = createSingleFlightGate()

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<SyncStartMessage | SyncStopMessage>) => {
  const { type } = event.data

  if (type === 'SYNC_START') {
    const { interval, apiKey, athleteId, timezone } = event.data as SyncStartMessage
    startBackgroundSync(interval, apiKey, athleteId, timezone)
  } else if (type === 'SYNC_STOP') {
    stopBackgroundSync()
  }
}

/**
 * Start periodic background sync
 */
function startBackgroundSync(interval: number, apiKey: string, athleteId: string, timezone?: string): void {
  stopBackgroundSync()

  // Initial sync
  performSync(apiKey, athleteId, timezone)

  // Periodic sync
  syncTimer.start(() => {
    performSync(apiKey, athleteId, timezone)
  }, interval)

  console.log(`[SyncWorker] Background sync started with interval: ${interval}ms`)
}

/**
 * Stop background sync
 */
function stopBackgroundSync(): void {
  syncTimer.stop()
  console.log('[SyncWorker] Background sync stopped')
}

/**
 * Perform actual sync operation
 */
async function performSync(apiKey: string, athleteId: string, timezone?: string): Promise<void> {
  if (!syncGate.tryAcquire()) return

  try {
    const now = Date.now()

    // Don't sync more than once per 5 minutes
    if (now - lastSyncTime < 5 * 60 * 1000) {
      return
    }

    // Keep the last successful cursor. Advancing it before the request can
    // permanently skip rides created between the previous sync and this one.
    const since = getSyncSince(lastSyncTime, now)

    // Fetch new rides from Intervals API route
    const response = await fetch('/api/intervals/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-intervals-api-key': apiKey,
        'x-intervals-athlete-id': athleteId,
        ...(timezone ? { 'x-athlete-timezone': timezone } : {}),
      },
      body: JSON.stringify({
        since,
      }),
    })

    if (!response.ok) {
      throw new Error(`Sync API failed: ${response.statusText}`)
    }

    const result = await response.json()

    // Send result to main thread
    const syncMessage: SyncResultMessage = {
      type: 'SYNC_RESULT',
      success: true,
      newRidesCount: result.newRidesCount || 0,
      changes: result.changes || [],
      rides: result.rides || [],
      nextCursor: result.nextCursor,
      timestamp: now,
    }

    lastSyncTime = getSuccessfulSyncCursor(
      lastSyncTime,
      result.rides?.length ? result.nextCursor : lastSyncTime,
      now
    )

    self.postMessage(syncMessage)

    console.log(`[SyncWorker] Sync completed: ${result.newRidesCount} new rides`)
  } catch (error) {
    console.error('[SyncWorker] Sync error:', error)

    const errorMessage: SyncResultMessage = {
      type: 'SYNC_RESULT',
      success: false,
      newRidesCount: 0,
      changes: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }

    self.postMessage(errorMessage)
  } finally {
    syncGate.release()
  }
}

export {}
