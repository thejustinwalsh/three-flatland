import { describe, expect, it } from 'vitest'
import { ScrubRequestTracker } from './scrub-request-tracker'

describe('ScrubRequestTracker', () => {
  it('accepts only the final output of a single uninterrupted request', () => {
    const tracker = new ScrubRequestTracker()
    const gen = tracker.start(3)
    tracker.enqueue(gen)
    tracker.enqueue(gen)
    tracker.enqueue(gen)

    expect(tracker.reportOutput()).toBe(false)
    expect(tracker.reportOutput()).toBe(false)
    expect(tracker.reportOutput()).toBe(true)
  })

  it('a single-chunk request accepts its one output', () => {
    const tracker = new ScrubRequestTracker()
    const gen = tracker.start(1)
    tracker.enqueue(gen)
    expect(tracker.reportOutput()).toBe(true)
  })

  it(
    'reproduces the reported race: queuing a short request before a long ' +
      "request's outputs land rejects every one of the long request's " +
      "outputs and accepts only the short request's",
    () => {
      const tracker = new ScrubRequestTracker()

      // Cursor A: a 20-chunk chain queued and fully enqueued...
      const genA = tracker.start(20)
      for (let i = 0; i < 20; i++) tracker.enqueue(genA)

      // ...then the cursor moves again before ANY of A's outputs have
      // arrived — B supersedes A while A's decodes are still in flight.
      const genB = tracker.start(1)
      tracker.enqueue(genB)

      // A naive "expected/received" reset would have A's very first
      // late output satisfy B's expected count of 1 and get drawn as
      // B's target frame. Every one of A's 20 outputs must be
      // rejected, in FIFO arrival order, and only B's output accepted.
      const results: boolean[] = []
      for (let i = 0; i < 21; i++) results.push(tracker.reportOutput())

      expect(results.slice(0, 20)).toEqual(new Array(20).fill(false))
      expect(results[20]).toBe(true)
    }
  )

  it('rejects an output with no matching pending decode (queue underrun)', () => {
    const tracker = new ScrubRequestTracker()
    tracker.start(1)
    expect(tracker.reportOutput()).toBe(false)
  })

  it('reset() clears pending entries without resetting the generation', () => {
    const tracker = new ScrubRequestTracker()
    const genA = tracker.start(5)
    tracker.enqueue(genA)
    tracker.reset()
    // The stale enqueue is gone; a later output for the current
    // generation has nothing to correlate against and is rejected.
    expect(tracker.reportOutput()).toBe(false)

    const genB = tracker.start(1)
    expect(genB).toBe(genA + 1)
    tracker.enqueue(genB)
    expect(tracker.reportOutput()).toBe(true)
  })

  it('an intervening superseded request between two live ones is fully rejected', () => {
    const tracker = new ScrubRequestTracker()
    const genA = tracker.start(2)
    tracker.enqueue(genA)
    tracker.enqueue(genA)

    const genB = tracker.start(3)
    tracker.enqueue(genB)
    tracker.enqueue(genB)
    tracker.enqueue(genB)

    const genC = tracker.start(1)
    tracker.enqueue(genC)

    const results = [
      tracker.reportOutput(), // A #1 — stale
      tracker.reportOutput(), // A #2 — stale
      tracker.reportOutput(), // B #1 — stale
      tracker.reportOutput(), // B #2 — stale
      tracker.reportOutput(), // B #3 — stale
      tracker.reportOutput(), // C #1 — current, final
    ]
    expect(results).toEqual([false, false, false, false, false, true])
  })
})
