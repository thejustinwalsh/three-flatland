import { describe, expect, it } from 'vitest'
import type { WebGPURenderer } from 'three/webgpu'
import { BatchCollector } from './BatchCollector'
import type { BatchesPayload } from '../debug-protocol'

/**
 * Minimal renderer.info.render shim — BatchCollector only reads
 * `calls` and `triangles` from `.render`, nothing else.
 */
function mockRenderer(): { r: WebGPURenderer; info: { calls: number; triangles: number } } {
  const info = { calls: 0, triangles: 0 }
  const r = { info: { render: info } } as unknown as WebGPURenderer
  return { r, info }
}

function freshOut(): BatchesPayload {
  return { frame: 0, passCount: 0, batchCount: 0 }
}

/** Run a full begin→frameStart→frameEnd→commit cycle. */
function runFrame(
  c: BatchCollector,
  r: WebGPURenderer,
  info: { calls: number; triangles: number },
  endCalls: number,
  endTris: number,
): void {
  c.beginFrame()
  c.frameStart(r)
  info.calls = endCalls
  info.triangles = endTris
  c.frameEnd(r)
  c.commit()
}

describe('BatchCollector', () => {
  it('short-circuits when not capturing', () => {
    const c = new BatchCollector()
    const { r, info } = mockRenderer()
    c.beginFrame()
    // Not capturing — begin/end should not record anything.
    c.beginPass('main', r)
    info.calls = 50
    c.endPass(r)
    c.commit()
    const out = freshOut()
    expect(c.drain(out, 1)).toBe(false)
  })

  it('ships per-frame once commit has published', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    runFrame(c, r, info, 42, 8000)
    const out = freshOut()
    expect(c.drain(out, 1)).toBe(true)
    expect(out.passCount).toBe(1)
    expect(out.passes![0]!.label).toBe('frame')
    expect(out.passes![0]!.calls).toBe(42)
    expect(out.passes![0]!.triangles).toBe(8000)
  })

  it('drain returns false when no commit has happened', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r } = mockRenderer()
    c.beginFrame()
    c.frameStart(r)
    // No frameEnd + commit — nothing published.
    expect(c.drain(freshOut(), 42)).toBe(false)
  })

  it('suppresses re-drain of the same version (protocol-level absent = no change)', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    runFrame(c, r, info, 10, 200)
    expect(c.drain(freshOut(), 1)).toBe(true)
    // Second drain without a new commit — nothing new to ship.
    expect(c.drain(freshOut(), 1)).toBe(false)
  })

  it('ships every frame after commit even with identical counters', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    runFrame(c, r, info, 10, 200)
    expect(c.drain(freshOut(), 1)).toBe(true)
    // Second frame with same deltas — commit bumps version, drain ships.
    runFrame(c, r, info, 20, 400)
    expect(c.drain(freshOut(), 2)).toBe(true)
  })

  it('double-buffers — old snapshot stays readable while next frame builds', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    runFrame(c, r, info, 10, 200)
    // Capture frame 1's payload shape.
    const out1 = freshOut()
    c.drain(out1, 1)
    const frame1CallsBeforeRebuild = out1.passes![0]!.calls

    // Mid-frame 2: beginFrame + frameStart + beginPass, but no commit.
    c.beginFrame()
    c.frameStart(r)
    info.calls = 100
    c.beginPass('mid', r)
    // The published-pool reference returned by drain() should STILL
    // reflect frame 1's numbers — we haven't committed anything new.
    expect(out1.passes![0]!.calls).toBe(frame1CallsBeforeRebuild)
  })

  it('tracks nested passes with proper parent/depth', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    c.beginFrame()
    c.frameStart(r)

    info.calls = 1
    c.beginPass('sdf', r)
    info.calls = 2
    c.beginPass('sdf.seed', r)
    info.calls = 3
    c.endPass(r)
    c.beginPass('sdf.jfa', r)
    info.calls = 14
    c.endPass(r)
    c.endPass(r)

    info.calls = 14
    c.frameEnd(r)
    c.commit()

    const out = freshOut()
    c.drain(out, 1)
    // frame (root, depth 0) + sdf (child of frame, depth 1) +
    // sdf.seed (child of sdf, depth 2) + sdf.jfa (child of sdf, depth 2)
    expect(out.passCount).toBe(4)
    expect(out.passes![0]!.label).toBe('frame')
    expect(out.passes![1]!.label).toBe('sdf')
    expect(out.passes![1]!.parent).toBe(0)
    expect(out.passes![1]!.depth).toBe(1)
    expect(out.passes![2]!.label).toBe('sdf.seed')
    expect(out.passes![2]!.parent).toBe(1)
    expect(out.passes![2]!.depth).toBe(2)
    expect(out.passes![3]!.label).toBe('sdf.jfa')
    expect(out.passes![3]!.parent).toBe(1)
  })

  it('captureAllSources tolerates null getters on both source sets', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    c.beginFrame()
    const regSources = new Set<() => null>([() => null, () => null])
    const meshSources = new Set<() => null>([() => null])
    c.captureAllSources(
      regSources as unknown as ReadonlySet<() => null>,
      meshSources as unknown as ReadonlySet<() => null>,
    )
    c.commit()
    const out = freshOut()
    expect(c.drain(out, 1)).toBe(true)
    expect(out.batchCount).toBe(0)
  })

  it('resetDelta forces re-emit', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    const { r, info } = mockRenderer()
    runFrame(c, r, info, 3, 60)
    const out = freshOut()
    c.drain(out, 1)
    expect(c.drain(out, 1)).toBe(false)
    c.resetDelta()
    expect(c.drain(out, 1)).toBe(true)
  })

  it('resetDelta on a fresh collector ships an empty snapshot', () => {
    const c = new BatchCollector()
    c.setCapturing(true)
    c.resetDelta()
    // No commit yet — version is 0, last emitted is -1 after reset.
    // Next drain should return true with an empty published pool.
    const out = freshOut()
    expect(c.drain(out, 0)).toBe(true)
    expect(out.passCount).toBe(0)
    expect(out.batchCount).toBe(0)
  })
})
