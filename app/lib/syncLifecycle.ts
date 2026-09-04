export interface SingleFlightGate {
  tryAcquire(): boolean
  release(): void
  isInFlight(): boolean
}

export function createSingleFlightGate(): SingleFlightGate {
  let inFlight = false

  return {
    tryAcquire() {
      if (inFlight) return false
      inFlight = true
      return true
    },
    release() {
      inFlight = false
    },
    isInFlight() {
      return inFlight
    },
  }
}

export interface IntervalController<T> {
  start(callback: () => void, interval: number): void
  stop(): void
}

export function createIntervalController<T>(
  setIntervalFn: (callback: () => void, interval: number) => T,
  clearIntervalFn: (handle: T) => void
): IntervalController<T> {
  let handle: T | null = null

  return {
    start(callback, interval) {
      if (handle !== null) clearIntervalFn(handle)
      handle = setIntervalFn(callback, interval)
    },
    stop() {
      if (handle === null) return
      clearIntervalFn(handle)
      handle = null
    },
  }
}
