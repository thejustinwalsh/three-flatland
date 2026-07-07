import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONCURRENT_MARK_GUARDRAIL,
  FlightRing,
  __resetFlightRecorderForTests,
  addFlightRingListener,
  exceedsMarkGuardrail,
  freeze,
  frozenUnionFrameRange,
  getBufferFrozenRing,
  getBufferLiveRing,
  getFrozenRing,
  getLiveRing,
  getMarkedBufferNames,
  isFrozen,
  markBuffer,
  unfreeze,
  unmarkBuffer,
} from './flight-ring'
import type { BufferChunkPayload } from '../devtools-client'

const CHUNK_WINDOW_MS = 10_000
const STATS_WINDOW_MS = 30_000

function chunk(overrides: Partial<BufferChunkPayload> & { frame: number }): BufferChunkPayload {
  return {
    name: 'atlas',
    capturedAt: 0,
    width: 4,
    height: 4,
    pixelType: 'rgba8',
    display: 'colors',
    keyFrame: false,
    codec: 'vp09.00.10.08',
    data: new ArrayBuffer(0),
    ...overrides,
  }
}

/** Fake clock — advance() moves it forward; ring() gets it as `now`. */
function makeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe('FlightRing — chunk retention', () => {
  it('evicts old chunks once a newer keyframe becomes the retained anchor', () => {
    const clock = makeClock()
    const ring = new FlightRing({ now: clock.now })
    ring.setBufferName('atlas')

    ring.pushChunk(chunk({ frame: 1, keyFrame: true }))
    clock.advance(1000)
    // A second keyframe — once it (not frame 1) falls outside the
    // window, it becomes the new retained anchor and frame 1 evicts.
    ring.pushChunk(chunk({ frame: 2, keyFrame: true }))

    clock.advance(CHUNK_WINDOW_MS + 1)
    ring.pushChunk(chunk({ frame: 3 }))

    expect(ring.chunkFrameRange()).toEqual({ min: 2, max: 3 })
    expect(ring.decodeChain(3)?.map((c) => c.frame)).toEqual([2, 3])
  })

  it('never evicts past the newest keyframe that still falls outside the window', () => {
    const clock = makeClock()
    const ring = new FlightRing({ now: clock.now })
    ring.setBufferName('atlas')

    ring.pushChunk(chunk({ frame: 1, keyFrame: true }))
    clock.advance(500)
    ring.pushChunk(chunk({ frame: 2 }))
    clock.advance(500)
    ring.pushChunk(chunk({ frame: 3 }))

    // Push deltas well past the 10s window WITHOUT a new keyframe —
    // frame 1's keyframe is the only anchor available, so it (and
    // everything after it) must survive even though it's now stale.
    clock.advance(CHUNK_WINDOW_MS + 5000)
    ring.pushChunk(chunk({ frame: 4 }))

    expect(ring.chunkFrameRange()).toEqual({ min: 1, max: 4 })
  })

  it("won't start the ring on a leading non-keyframe delta", () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 1, keyFrame: false }))
    expect(ring.chunkFrameRange()).toBeNull()
    ring.pushChunk(chunk({ frame: 2, keyFrame: true }))
    expect(ring.chunkFrameRange()).toEqual({ min: 2, max: 2 })
  })

  it('ignores chunks for a buffer other than the tracked one', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 1, keyFrame: true, name: 'other' }))
    expect(ring.chunkFrameRange()).toBeNull()
  })

  it('switching the tracked buffer drops prior chunks', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 1, keyFrame: true }))
    ring.setBufferName('other')
    expect(ring.chunkFrameRange()).toBeNull()
    ring.pushChunk(chunk({ frame: 2, keyFrame: true, name: 'other' }))
    expect(ring.chunkFrameRange()).toEqual({ min: 2, max: 2 })
  })
})

describe('FlightRing — stats retention', () => {
  it('evicts frame-arrival entries older than the 30s window', () => {
    const clock = makeClock()
    const ring = new FlightRing({ now: clock.now })
    ring.pushFrame(1)
    clock.advance(STATS_WINDOW_MS + 1)
    ring.pushFrame(2)
    expect(ring.statsFrameRange()).toEqual({ min: 2, max: 2 })
  })

  it('retains everything inside the 30s window', () => {
    const clock = makeClock()
    const ring = new FlightRing({ now: clock.now })
    ring.pushFrame(1)
    clock.advance(STATS_WINDOW_MS - 1)
    ring.pushFrame(2)
    expect(ring.statsFrameRange()).toEqual({ min: 1, max: 2 })
  })
})

describe('FlightRing — combined frame range', () => {
  it('intersects chunk and stats ranges when both are present', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 5, keyFrame: true }))
    ring.pushChunk(chunk({ frame: 10 }))
    ring.pushFrame(1)
    ring.pushFrame(20)
    expect(ring.frameRange()).toEqual({ min: 5, max: 10 })
  })

  it('falls back to whichever sub-range has data', () => {
    const ring = new FlightRing()
    ring.pushFrame(1)
    ring.pushFrame(2)
    expect(ring.frameRange()).toEqual({ min: 1, max: 2 })
  })

  it('returns null when there is no overlap', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 100, keyFrame: true }))
    ring.pushFrame(1)
    ring.pushFrame(2)
    expect(ring.frameRange()).toBeNull()
  })
})

describe('FlightRing — decodeChain', () => {
  it('resolves the nearest keyframe ≤ cursor forward through the nearest chunk ≤ cursor', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 10, keyFrame: true }))
    ring.pushChunk(chunk({ frame: 11 }))
    ring.pushChunk(chunk({ frame: 12 }))
    ring.pushChunk(chunk({ frame: 15, keyFrame: true }))
    ring.pushChunk(chunk({ frame: 16 }))

    expect(ring.decodeChain(12)?.map((c) => c.frame)).toEqual([10, 11, 12])
    expect(ring.decodeChain(14)?.map((c) => c.frame)).toEqual([10, 11, 12])
    expect(ring.decodeChain(16)?.map((c) => c.frame)).toEqual([15, 16])
  })

  it('clamps a cursor past the newest chunk to the newest decode chain', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 10, keyFrame: true }))
    ring.pushChunk(chunk({ frame: 11 }))
    expect(ring.decodeChain(1000)?.map((c) => c.frame)).toEqual([10, 11])
  })

  it('returns null when the cursor predates every retained chunk', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 10, keyFrame: true }))
    expect(ring.decodeChain(5)).toBeNull()
  })

  it('returns null on an empty ring', () => {
    const ring = new FlightRing()
    expect(ring.decodeChain(5)).toBeNull()
  })
})

describe('FlightRing — clone', () => {
  it('mutating the live ring after cloning never changes the snapshot', () => {
    const ring = new FlightRing()
    ring.setBufferName('atlas')
    ring.pushChunk(chunk({ frame: 1, keyFrame: true }))
    ring.pushFrame(1)

    const snap = ring.clone()

    ring.pushChunk(chunk({ frame: 2 }))
    ring.pushFrame(2)
    ring.setBufferName('other')
    ring.pushChunk(chunk({ frame: 3, keyFrame: true, name: 'other' }))

    expect(snap.chunkFrameRange()).toEqual({ min: 1, max: 1 })
    expect(snap.statsFrameRange()).toEqual({ min: 1, max: 1 })
    expect(snap.bufferName).toBe('atlas')
  })
})

describe('flight recorder singleton — freeze/unfreeze', () => {
  beforeEach(() => {
    __resetFlightRecorderForTests()
  })
  afterEach(() => {
    __resetFlightRecorderForTests()
  })

  it('starts live', () => {
    expect(isFrozen()).toBe(false)
    expect(getFrozenRing()).toBeNull()
  })

  it('freeze clones the live ring; further live pushes do not affect the snapshot', () => {
    getLiveRing().setBufferName('atlas')
    getLiveRing().pushChunk(chunk({ frame: 1, keyFrame: true }))

    freeze()
    expect(isFrozen()).toBe(true)
    const frozen = getFrozenRing()
    expect(frozen).not.toBeNull()
    expect(frozen!.chunkFrameRange()).toEqual({ min: 1, max: 1 })

    // Live ring keeps recording after freeze (#29 item 14).
    getLiveRing().pushChunk(chunk({ frame: 2 }))
    expect(getLiveRing().chunkFrameRange()).toEqual({ min: 1, max: 2 })
    expect(frozen!.chunkFrameRange()).toEqual({ min: 1, max: 1 })
  })

  it('unfreeze drops the snapshot', () => {
    freeze()
    expect(isFrozen()).toBe(true)
    unfreeze()
    expect(isFrozen()).toBe(false)
    expect(getFrozenRing()).toBeNull()
  })

  it('re-freezing while already frozen is a no-op', () => {
    getLiveRing().setBufferName('atlas')
    getLiveRing().pushChunk(chunk({ frame: 1, keyFrame: true }))
    freeze()
    const first = getFrozenRing()
    getLiveRing().pushChunk(chunk({ frame: 2 }))
    freeze()
    expect(getFrozenRing()).toBe(first)
  })

  it('fires listeners on freeze and unfreeze', () => {
    let fired = 0
    const off = addFlightRingListener(() => {
      fired++
    })
    freeze()
    unfreeze()
    off()
    freeze()
    expect(fired).toBe(2)
  })
})

describe('multi-buffer marks — per-buffer ring map (#29 Phase C slice 4)', () => {
  beforeEach(() => {
    __resetFlightRecorderForTests()
  })
  afterEach(() => {
    __resetFlightRecorderForTests()
  })

  it('starts with no marked buffers', () => {
    expect(getMarkedBufferNames()).toEqual([])
    expect(getBufferLiveRing('atlas')).toBeNull()
  })

  it('marking a buffer creates a ring tracking that buffer name', () => {
    markBuffer('atlas')
    expect(getMarkedBufferNames()).toEqual(['atlas'])
    const ring = getBufferLiveRing('atlas')
    expect(ring).not.toBeNull()
    expect(ring!.bufferName).toBe('atlas')
  })

  it('marking is idempotent — marking twice keeps the same ring instance', () => {
    markBuffer('atlas')
    const first = getBufferLiveRing('atlas')
    markBuffer('atlas')
    expect(getBufferLiveRing('atlas')).toBe(first)
  })

  it('marking multiple buffers keeps independent rings', () => {
    markBuffer('atlas')
    markBuffer('shadowmap')
    getBufferLiveRing('atlas')!.pushChunk(chunk({ frame: 1, keyFrame: true, name: 'atlas' }))
    getBufferLiveRing('shadowmap')!.pushChunk(chunk({ frame: 5, keyFrame: true, name: 'shadowmap' }))
    expect(getBufferLiveRing('atlas')!.chunkFrameRange()).toEqual({ min: 1, max: 1 })
    expect(getBufferLiveRing('shadowmap')!.chunkFrameRange()).toEqual({ min: 5, max: 5 })
    expect(getMarkedBufferNames()).toEqual(['atlas', 'shadowmap'])
  })

  it('unmarking drops the live ring for that buffer only', () => {
    markBuffer('atlas')
    markBuffer('shadowmap')
    unmarkBuffer('atlas')
    expect(getBufferLiveRing('atlas')).toBeNull()
    expect(getBufferLiveRing('shadowmap')).not.toBeNull()
    expect(getMarkedBufferNames()).toEqual(['shadowmap'])
  })

  it('unmarking an unmarked name is a no-op', () => {
    expect(() => unmarkBuffer('nope')).not.toThrow()
    expect(getMarkedBufferNames()).toEqual([])
  })

  it('freeze clones every marked buffer ring atomically; further live pushes do not affect the snapshots', () => {
    markBuffer('atlas')
    markBuffer('shadowmap')
    getBufferLiveRing('atlas')!.pushChunk(chunk({ frame: 1, keyFrame: true, name: 'atlas' }))
    getBufferLiveRing('shadowmap')!.pushChunk(chunk({ frame: 10, keyFrame: true, name: 'shadowmap' }))

    freeze()

    expect(getBufferFrozenRing('atlas')!.chunkFrameRange()).toEqual({ min: 1, max: 1 })
    expect(getBufferFrozenRing('shadowmap')!.chunkFrameRange()).toEqual({ min: 10, max: 10 })

    getBufferLiveRing('atlas')!.pushChunk(chunk({ frame: 2, name: 'atlas' }))
    expect(getBufferLiveRing('atlas')!.chunkFrameRange()).toEqual({ min: 1, max: 2 })
    // The frozen snapshot is unaffected by the live ring's later pushes.
    expect(getBufferFrozenRing('atlas')!.chunkFrameRange()).toEqual({ min: 1, max: 1 })
  })

  it('a buffer marked after freeze has no frozen ring (it was not live at freeze time)', () => {
    markBuffer('atlas')
    freeze()
    markBuffer('shadowmap')
    expect(getBufferFrozenRing('atlas')).not.toBeNull()
    expect(getBufferFrozenRing('shadowmap')).toBeNull()
  })

  it('unfreeze drops every frozen buffer ring', () => {
    markBuffer('atlas')
    freeze()
    unfreeze()
    expect(getBufferFrozenRing('atlas')).toBeNull()
  })

  it('unmarking a live buffer after freeze does not affect its already-frozen snapshot', () => {
    markBuffer('atlas')
    getBufferLiveRing('atlas')!.pushChunk(chunk({ frame: 1, keyFrame: true, name: 'atlas' }))
    freeze()
    unmarkBuffer('atlas')
    expect(getBufferLiveRing('atlas')).toBeNull()
    expect(getBufferFrozenRing('atlas')!.chunkFrameRange()).toEqual({ min: 1, max: 1 })
  })

  it('frozenUnionFrameRange unions the primary ring with every marked buffer snapshot', () => {
    getLiveRing().pushFrame(1)
    getLiveRing().pushFrame(2)
    markBuffer('atlas')
    markBuffer('shadowmap')
    getBufferLiveRing('atlas')!.pushChunk(chunk({ frame: 100, keyFrame: true, name: 'atlas' }))
    getBufferLiveRing('shadowmap')!.pushChunk(chunk({ frame: 500, keyFrame: true, name: 'shadowmap' }))

    freeze()

    expect(frozenUnionFrameRange()).toEqual({ min: 1, max: 500 })
  })

  it('frozenUnionFrameRange is null while live', () => {
    markBuffer('atlas')
    expect(frozenUnionFrameRange()).toBeNull()
  })
})

describe('concurrent-mark guardrail (#29 item 8)', () => {
  it('is quiet at or below the guardrail', () => {
    expect(exceedsMarkGuardrail(0)).toBe(false)
    expect(exceedsMarkGuardrail(1)).toBe(false)
    expect(exceedsMarkGuardrail(CONCURRENT_MARK_GUARDRAIL)).toBe(false)
  })

  it('warns beyond the guardrail', () => {
    expect(exceedsMarkGuardrail(CONCURRENT_MARK_GUARDRAIL + 1)).toBe(true)
    expect(exceedsMarkGuardrail(9)).toBe(true)
  })
})
