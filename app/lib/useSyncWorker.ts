/**
 * Hook to manage background sync worker
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { storage } from './storage'


interface SyncResult {
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

type IntervalsCredentials = {
  apiKey: string
  athleteId: string
  timezone?: string
}

/**
 * Hook to start and manage background sync worker
 * Syncs with Intervals.icu in the background every 15 minutes
 */
export function useSyncWorker(
  intervalsCredentials: IntervalsCredentials | null,
  onSyncComplete?: (result: SyncResult) => void,
  timezone?: string
): {
  isRunning: boolean
  startSync: () => void
  stopSync: () => void
} {
  const workerRef = useRef<Worker | null>(null)
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncInFlightRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)

  const runMainThreadSync = useCallback(async () => {
    if (!intervalsCredentials || syncInFlightRef.current) {
      return
    }

    syncInFlightRef.current = true

    try {
      const response = await fetch('/api/intervals/rides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-intervals-api-key': intervalsCredentials.apiKey,
          'x-intervals-athlete-id': intervalsCredentials.athleteId,
                  ...(timezone ? { 'x-athlete-timezone': timezone } : {}),
        },
        body: JSON.stringify({
          since: Date.now() - 15 * 60 * 1000,
        }),
      })

      if (!response.ok) {
        throw new Error(`Sync API failed: ${response.statusText}`)
      }

      const result = (await response.json()) as {
        newRidesCount?: number
        changes?: Array<{ type: string; label: string }>
        rides?: Array<Record<string, unknown>>
        nextCursor?: number
      }

      await Promise.all(
        (result.rides || []).map((ride) => {
          const id = typeof ride.id === 'string' ? ride.id : ''
          return id ? storage.cacheRide(`ride-${id}`, { ...ride, rideDate: ride.date }) : Promise.resolve()
        })
      )

      onSyncComplete?.({
        success: true,
        newRidesCount: result.newRidesCount || 0,
        changes: result.changes || [],
        rides: result.rides || [],
        nextCursor: result.nextCursor,
        timestamp: Date.now(),
      })
    } catch (error) {
      onSyncComplete?.({
        success: false,
        newRidesCount: 0,
        changes: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      })
    } finally {
      syncInFlightRef.current = false
    }
  }, [intervalsCredentials, onSyncComplete, timezone])

  // Initialize worker
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const worker = new Worker('/sync-worker.js')

      worker.onmessage = (event) => {
        const result = event.data as SyncResult
        console.info('Sync worker result', { success: result.success, ridesCount: result.newRidesCount })

        if (onSyncComplete) {
          onSyncComplete(result)
        }
      }

      worker.onerror = (error) => {
        console.error('Sync worker error', { error: error.message })
        workerRef.current = null
      }

      workerRef.current = worker

      return () => {
        worker.terminate()
        workerRef.current = null

        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current)
          fallbackIntervalRef.current = null
        }

        setIsRunning(false)
      }
    } catch (error) {
      console.warn('Web Worker unavailable, using main thread sync fallback', { error })
      workerRef.current = null
    }
  }, [onSyncComplete])

  const startSync = useCallback(() => {
    if (!intervalsCredentials || isRunning) {
      console.warn('Cannot start sync: worker is already running or credentials are missing')
      return
    }

    // 15 minutes in milliseconds
    const syncInterval = 15 * 60 * 1000

    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'SYNC_START',
        interval: syncInterval,
        apiKey: intervalsCredentials.apiKey,
        athleteId: intervalsCredentials.athleteId,
        timezone,
      })
    } else {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current)
      }
      runMainThreadSync()
      fallbackIntervalRef.current = setInterval(runMainThreadSync, syncInterval)
      console.info('Started main-thread sync fallback')
    }

    setIsRunning(true)
    console.info('Background sync started')
  }, [intervalsCredentials, isRunning, runMainThreadSync, timezone])

  const stopSync = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'SYNC_STOP',
      })
    }

    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current)
      fallbackIntervalRef.current = null
    }

    setIsRunning(false)
    console.info('Background sync stopped')
  }, [])

  return {
    isRunning,
    startSync,
    stopSync,
  }
}
