import { createIntervalController, createSingleFlightGate } from './syncLifecycle'

describe('sync lifecycle controls', () => {
  it('allows only one in-flight operation at a time', () => {
    const gate = createSingleFlightGate()

    expect(gate.tryAcquire()).toBe(true)
    expect(gate.tryAcquire()).toBe(false)
    expect(gate.isInFlight()).toBe(true)

    gate.release()

    expect(gate.isInFlight()).toBe(false)
    expect(gate.tryAcquire()).toBe(true)
  })

  it('replaces an existing timer when started again and clears it on stop', () => {
    const callbacks: Array<() => void> = []
    const cleared: number[] = []
    let nextHandle = 1
    const timer = createIntervalController(
      (callback) => {
        callbacks.push(callback)
        return nextHandle++
      },
      (handle) => cleared.push(handle)
    )

    timer.start(() => undefined, 1_000)
    timer.start(() => undefined, 1_000)
    timer.stop()
    timer.stop()

    expect(callbacks).toHaveLength(2)
    expect(cleared).toEqual([1, 2])
  })
})