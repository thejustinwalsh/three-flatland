import { describe, expect, it } from 'vitest'
import { DataTexture } from 'three'
import { DebugTextureRegistry } from './DebugTextureRegistry'
import type { BuffersSubscription } from './SubscriberRegistry'
import type { BuffersPayload } from '../debug-protocol'
import type { WebGPURenderer } from 'three/webgpu'

/**
 * Drain contract — the fix for the buffer-streaming regression.
 *
 *   * `delta.pixels` references the cached sample directly. No copy, no
 *     pool cursor, no size budget. The convert path in `DevtoolsProvider._flush`
 *     reads this reference, copies into its own large convert buffer, queues
 *     the `__convert__` transfer, and strips `entry.pixels` before broadcast.
 *
 *   * That makes `_flush`'s pool buffer size completely independent of the
 *     largest registered texture, which was the trap the medium-tier change
 *     fell into (256 KB cursor + a 4 MB ForwardPlus tile texture = silent
 *     pixel loss).
 *
 * If either of those properties regresses, buffer streaming in the dashboard
 * breaks. These tests pin them in place.
 */

const NO_RENDERER = undefined as unknown as WebGPURenderer

function subOf(names: readonly string[], mode: 'stream' | 'thumbnail' = 'thumbnail'): BuffersSubscription {
  const m = new Map() as BuffersSubscription
  for (const n of names) m.set(n, { mode })
  return m
}

function dataTex(width: number, height: number, fill: number = 0): DataTexture {
  const data = new Uint8Array(width * height * 4)
  if (fill !== 0) data.fill(fill)
  return new DataTexture(data, width, height)
}

function emptyPayload(): BuffersPayload {
  return {} as BuffersPayload
}

describe('DebugTextureRegistry.drain', () => {
  it('references the cached sample directly — no copy', () => {
    const reg = new DebugTextureRegistry()
    const tex = dataTex(4, 4, 0xab)
    reg.register('test', tex, 'rgba8')
    reg.readbackAll(subOf(['test']), NO_RENDERER)

    const out = emptyPayload()
    const wrote = reg.drain(out, subOf(['test']), NO_RENDERER)
    expect(wrote).toBe(true)

    const entry = out.entries?.['test']
    expect(entry).toBeDefined()
    expect(entry!.pixels).toBeInstanceOf(Uint8Array)

    // Identity: drain MUST NOT copy. Reading the entry pixels and the
    // underlying sample (via a second drain after touching the version)
    // would otherwise see different ArrayBuffer-backed memory.
    const firstSampleBuffer = (entry!.pixels as Uint8Array).buffer
    expect((entry!.pixels as Uint8Array)[0]).toBe(0xab)

    // Mutate the source DataTexture's underlying buffer — drain captured a
    // *copy snapshot* during readback, so the entry.pixels we already drew
    // shouldn't change retroactively (separate ArrayBuffer from texture's).
    ;(tex.image.data as Uint8Array)[0] = 0xff
    expect((entry!.pixels as Uint8Array)[0]).toBe(0xab)

    // …but a fresh readback + drain DOES see the new value (re-snapshot).
    reg.touch('test')
    reg.readbackAll(subOf(['test']), NO_RENDERER)
    const out2 = emptyPayload()
    reg.drain(out2, subOf(['test']), NO_RENDERER)
    expect((out2.entries!['test']!.pixels as Uint8Array)[0]).toBe(0xff)

    // And: the published `pixels` view still references the sample's own
    // backing buffer (one indirection, no intermediate cursor allocation).
    expect((out2.entries!['test']!.pixels as Uint8Array).buffer).not.toBe(firstSampleBuffer)
  })

  it('omits pixels when the entry is not in the pixel subscription', () => {
    const reg = new DebugTextureRegistry()
    reg.register('inside', dataTex(2, 2), 'rgba8')
    reg.register('outside', dataTex(2, 2), 'rgba8')
    reg.readbackAll(subOf(['inside', 'outside']), NO_RENDERER)

    // Subscribe pixels for 'inside' only — 'outside' should ship metadata only.
    const out = emptyPayload()
    reg.drain(out, subOf(['inside']), NO_RENDERER)
    expect(out.entries?.['inside']?.pixels).toBeInstanceOf(Uint8Array)
    expect(out.entries?.['outside']?.pixels).toBeUndefined()
    expect(out.entries?.['outside']?.width).toBe(2)
  })

  it('handles huge samples without size warnings or pixel loss (regression)', () => {
    const warnings: unknown[] = []
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    try {
      const reg = new DebugTextureRegistry()
      // ForwardPlus-shaped: 1024×1024 RGBA8 = 4 MB. Pre-fix this overflowed
      // every plausible cursor; the new path doesn't have a cursor.
      const huge = dataTex(1024, 1024, 0x42)
      reg.register('forwardPlus.tiles', huge, 'rgba8')
      reg.readbackAll(subOf(['forwardPlus.tiles']), NO_RENDERER)

      const out = emptyPayload()
      reg.drain(out, subOf(['forwardPlus.tiles']), NO_RENDERER)

      const entry = out.entries?.['forwardPlus.tiles']
      expect(entry?.pixels).toBeInstanceOf(Uint8Array)
      expect((entry!.pixels as Uint8Array).byteLength).toBe(1024 * 1024 * 4)
      // No "exceeds remaining pool buffer space" — the warning is gone.
      expect(warnings).toHaveLength(0)
    } finally {
      console.warn = realWarn
    }
  })

  it('emits metadata only when a sample has not been read back yet', () => {
    const reg = new DebugTextureRegistry()
    reg.register('pending', dataTex(2, 2), 'rgba8')
    // Intentionally no readbackAll — sample stays null.

    const out = emptyPayload()
    const wrote = reg.drain(out, subOf(['pending']), NO_RENDERER)
    expect(wrote).toBe(true)
    expect(out.entries?.['pending']).toBeDefined()
    expect(out.entries?.['pending']?.pixels).toBeUndefined()
    expect(out.entries?.['pending']?.pixelType).toBe('rgba8')
  })

  it('suppresses re-emission while version and shape are unchanged', () => {
    const reg = new DebugTextureRegistry()
    reg.register('stable', dataTex(2, 2), 'rgba8')
    reg.readbackAll(subOf(['stable']), NO_RENDERER)

    const out1 = emptyPayload()
    expect(reg.drain(out1, subOf(['stable']), NO_RENDERER)).toBe(true)

    // Second drain with no new version + same subscription shape: no-op.
    const out2 = emptyPayload()
    expect(reg.drain(out2, subOf(['stable']), NO_RENDERER)).toBe(false)
    expect(out2.entries).toBeUndefined()

    // Toggling out of the pixel subscription IS a shape change → re-emit.
    const out3 = emptyPayload()
    expect(reg.drain(out3, subOf([]), NO_RENDERER)).toBe(true)
    expect(out3.entries?.['stable']?.pixels).toBeUndefined()
  })
})
