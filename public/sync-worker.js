/**
 * Static background sync worker served from /public.
 * This avoids Turbopack chunk loading issues for module workers in dev.
 */

let syncInterval = null
let lastSyncTime = 0

self.onmessage = (event) => {
  const { type } = event.data || {}

  if (type === 'SYNC_START') {
    const { interval, apiKey, athleteId } = event.data
    startBackgroundSync(interval, apiKey, athleteId)
  }

  if (type === 'SYNC_STOP') {
    stopBackgroundSync()
  }
}

function startBackgroundSync(interval, apiKey, athleteId) {
  performSync(apiKey, athleteId)

  syncInterval = setInterval(() => {
    performSync(apiKey, athleteId)
  }, interval)
}

function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

async function performSync(apiKey, athleteId) {
  try {
    const now = Date.now()

    if (now - lastSyncTime < 5 * 60 * 1000) {
      return
    }

    lastSyncTime = now

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

    self.postMessage({
      type: 'SYNC_RESULT',
      success: true,
      newRidesCount: result.newRidesCount || 0,
      changes: result.changes || [],
      timestamp: now,
    })
  } catch (error) {
    self.postMessage({
      type: 'SYNC_RESULT',
      success: false,
      newRidesCount: 0,
      changes: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    })
  }
}
