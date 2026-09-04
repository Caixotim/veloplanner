/**
 * Static background sync worker served from /public.
 * This avoids Turbopack chunk loading issues for module workers in dev.
 */

let syncInterval = null
let lastSyncTime = 0
let syncInFlight = false

self.onmessage = (event) => {
  const { type } = event.data || {}

  if (type === 'SYNC_START') {
    const { interval, apiKey, athleteId, timezone } = event.data
    startBackgroundSync(interval, apiKey, athleteId, timezone)
  }

  if (type === 'SYNC_STOP') {
    stopBackgroundSync()
  }
}

function startBackgroundSync(interval, apiKey, athleteId, timezone) {
  stopBackgroundSync()

  performSync(apiKey, athleteId, timezone)

  syncInterval = setInterval(() => {
    performSync(apiKey, athleteId, timezone)
  }, interval)
}

function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

async function performSync(apiKey, athleteId, timezone) {
  if (syncInFlight) return

  syncInFlight = true
  try {
    const now = Date.now()

    if (now - lastSyncTime < 5 * 60 * 1000) {
      return
    }

    // Advance the cursor only after a successful request. Use a small overlap
    // so rides arriving near the cursor are not lost.
    const since = lastSyncTime > 0 ? Math.max(0, lastSyncTime - 5 * 60 * 1000) : 0

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

    self.postMessage({
      type: 'SYNC_RESULT',
      success: true,
      newRidesCount: result.newRidesCount || 0,
      changes: result.changes || [],
      rides: result.rides || [],
      nextCursor: result.nextCursor,
      timestamp: now,
    })

    const responseCursor = result.rides?.length
      ? typeof result.nextCursor === 'number' && Number.isFinite(result.nextCursor) ? result.nextCursor : now
      : lastSyncTime
    lastSyncTime = Math.max(lastSyncTime, responseCursor)
  } catch (error) {
    self.postMessage({
      type: 'SYNC_RESULT',
      success: false,
      newRidesCount: 0,
      changes: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    })
  } finally {
    syncInFlight = false
  }
}
