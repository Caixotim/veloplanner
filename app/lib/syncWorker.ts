/**
 * Background sync worker for continuous Intervals.icu synchronization
 * This worker runs in the background and periodically syncs data
 */

// Types for messaging with main thread
interface SyncStartMessage {
  type: 'SYNC_START'
  interval: number // milliseconds
  apiKey: string
  athleteId: string
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
  error?: string
  timestamp: number
}

let syncInterval: ReturnType<typeof setInterval> | null = null
let lastSyncTime = 0

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<SyncStartMessage | SyncStopMessage>) => {
  const { type } = event.data

  if (type === 'SYNC_START') {
    const { interval, apiKey, athleteId } = event.data as SyncStartMessage
    startBackgroundSync(interval, apiKey, athleteId)
  } else if (type === 'SYNC_STOP') {
    stopBackgroundSync()
  }
}

/**
 * Start periodic background sync
 */
function startBackgroundSync(interval: number, apiKey: string, athleteId: string): void {
  // Initial sync
  performSync(apiKey, athleteId)

  // Periodic sync
  syncInterval = setInterval(() => {
    performSync(apiKey, athleteId)
  }, interval)

  console.log(`[SyncWorker] Background sync started with interval: ${interval}ms`)
}

/**
 * Stop background sync
 */
function stopBackgroundSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log('[SyncWorker] Background sync stopped')
  }
}

/**
 * Perform actual sync operation
 */
async function performSync(apiKey: string, athleteId: string): Promise<void> {
  try {
    const now = Date.now()

    // Don't sync more than once per 5 minutes
    if (now - lastSyncTime < 5 * 60 * 1000) {
      return
    }

    lastSyncTime = now

    // Fetch new rides from Intervals API route
    const response = await fetch('/api/intervals/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-intervals-api-key': apiKey,
        'x-intervals-athlete-id': athleteId,
      },
      body: JSON.stringify({
        since: lastSyncTime,
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
      timestamp: now,
    }

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
  }
}

export {}
