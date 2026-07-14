import { describe, expect, it } from 'vitest'
import { instancedClipCoverage, panelClippingLanes } from './shader.js'

/**
 * Walk a TSL node graph and tally (a) how many `aClipping*` attribute lanes it
 * reads and (b) how many times each math method (`fwidth`, `smoothstep`, `dot`)
 * appears. This is the headless equivalent of dumping the compiled fragment and
 * grepping the clip-plane derivative/smoothstep count (see
 * `.claude/skills/tsl/performance.md`): the `instancedClipCoverage` node is walked
 * BEFORE it is wrapped in an `Fn`, so traversal reaches the real leaves instead of
 * stopping at the lazy function boundary.
 */
function scanClip(node: unknown) {
  const seen = new Set<unknown>()
  let clipLanes = 0
  const methods = new Map<string, number>()
  const walk = (x: any) => {
    if (x == null || typeof x !== 'object' || seen.has(x)) {
      return
    }
    seen.add(x)
    if (typeof x._attributeName === 'string' && x._attributeName.startsWith('aClipping')) {
      clipLanes++
    }
    if (typeof x.method === 'string') {
      methods.set(x.method, (methods.get(x.method) ?? 0) + 1)
    }
    if (typeof x.traverse === 'function') {
      x.traverse((child: unknown) => walk(child))
    }
  }
  walk(node)
  return {
    clipLanes,
    fwidth: methods.get('fwidth') ?? 0,
    smoothstep: methods.get('smoothstep') ?? 0,
    dot: methods.get('dot') ?? 0,
  }
}

describe('instanced clip-coverage build-time variant (perf win #3)', () => {
  it('count=0 emits ZERO clip lanes and NO clip-plane fwidth/smoothstep', () => {
    // The unclipped variant: an all-unclipped batch pays zero clip ALU per fragment.
    const scan = scanClip(instancedClipCoverage(0))
    expect(scan.clipLanes).toBe(0)
    expect(scan.fwidth).toBe(0)
    expect(scan.smoothstep).toBe(0)
    expect(scan.dot).toBe(0)
  })

  it('count=N emits exactly N clip lanes, each with one fwidth + one smoothstep', () => {
    for (const n of [1, 2, 3, 4]) {
      const scan = scanClip(instancedClipCoverage(n))
      expect(scan.clipLanes).toBe(n)
      expect(scan.fwidth).toBe(n)
      expect(scan.smoothstep).toBe(n)
      expect(scan.dot).toBe(n)
    }
  })

  it('the clipped panel variant unrolls all four ClippingRect planes', () => {
    // A ClippingRect is always four planes, so the clipped group builds count=4.
    const scan = scanClip(instancedClipCoverage(panelClippingLanes.length))
    expect(scan.clipLanes).toBe(4)
    expect(scan.smoothstep).toBe(4)
  })

  it('clamps out-of-range counts to the four physical lanes (no over-unroll)', () => {
    // Guards against emitting dead planes past the four attribute lanes (#4-style over-unroll).
    expect(scanClip(instancedClipCoverage(9)).clipLanes).toBe(4)
    expect(scanClip(instancedClipCoverage(-1)).clipLanes).toBe(0)
  })
})
