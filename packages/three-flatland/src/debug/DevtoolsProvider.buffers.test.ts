import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTexture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { DevtoolsProvider } from './DevtoolsProvider'
import type { BusTransport, ConvertRequest } from './bus-transport'
import type { DebugMessage } from '../debug-protocol'

/**
 * Buffer-streaming flush contract.
 *
 * Two invariants pin the buffer-streaming fix:
 *
 *   1. **Pixels travel via `transport.convert()`** — every entry whose sample
 *      is present and in the pixel subscription is converted on the worker
 *      and rebroadcast as `buffer:raw` / `buffer:chunk`. If this regresses,
 *      the consumer never receives texture pixels.
 *
 *   2. **Pixels do NOT travel via the broadcast data message** — after the
 *      convert call has queued, `entry.pixels` is stripped from the buffers
 *      payload, so the worker's `BroadcastChannel` re-broadcast carries
 *      metadata only. If this regresses, every same-page receiver clones the
 *      raw pixel bytes and the per-flush wobble returns.
 */

function mockRenderer(): WebGPURenderer {
  return {
    info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 } },
    backend: { trackTimestamp: false, constructor: { name: 'WebGPUBackend' } },
  } as unknown as WebGPURenderer
}

function dataTex(width: number, height: number, fill = 0xa5): DataTexture {
  const data = new Uint8Array(width * height * 4)
  data.fill(fill)
  return new DataTexture(data, width, height)
}

interface CapturingTransport extends BusTransport {
  readonly posts: DebugMessage[]
  readonly converts: ConvertRequest[]
}

function mkTransport(): CapturingTransport {
  const posts: DebugMessage[] = []
  const converts: ConvertRequest[] = []
  return {
    posts,
    converts,
    codecSupported: false,
    acquireSmall: () => new ArrayBuffer(4 * 1024),
    acquireMedium: () => new ArrayBuffer(256 * 1024),
    acquireLarge: () => new ArrayBuffer(16 * 1024 * 1024),
    post: (msg) => { posts.push(msg) },
    convert: (req) => { converts.push(req) },
    releaseUnused: () => { /* no-op */ },
    poolStats: () => ({ smallFree: 0, mediumFree: 0, largeFree: 0 }),
    dispose: () => { /* no-op */ },
  }
}

let active: DevtoolsProvider | null = null

function makeProvider(suffix: string): {
  provider: DevtoolsProvider
  transport: CapturingTransport
} {
  const p = new DevtoolsProvider({
    id: `bufflush-${suffix}`,
    discoveryChannelName: `flatland-debug-bufflush-${suffix}`,
  })
  p.start()
  active = p
  const transport = mkTransport()
  // Replace the live transport with our capturing mock so we can inspect
  // the exact messages and convert requests `_flush` produces. The real
  // transport stays disposed of by `provider.dispose()` in afterEach via
  // the original reference held internally; the mock has no resources.
  ;(p as unknown as { _dataTransport: BusTransport })._dataTransport = transport
  return { provider: p, transport }
}

function flush(provider: DevtoolsProvider): void {
  ;(provider as unknown as { _flush: () => void })._flush()
}

afterEach(() => {
  active?.dispose()
  active = null
})

describe('DevtoolsProvider _flush — buffer pixel routing', () => {
  it('routes pixels through convert() and strips them from the broadcast data message', () => {
    const { provider, transport } = makeProvider('routes')
    const renderer = mockRenderer()

    // Register a 1 MB texture (256×256 RGBA8) — bigger than the medium tier,
    // which is exactly the case the trivial fix exists to handle.
    provider.registry  // no-op, just confirm the provider is alive
    const tex = dataTex(256, 256, 0xa5)
    const debugTextures = (provider as unknown as { _textures: {
      register: (n: string, t: DataTexture, p: string) => void
      readbackAll: (sub: Map<string, { mode: 'thumbnail' }>, r: WebGPURenderer) => void
    } })._textures
    debugTextures.register('big', tex, 'rgba8')

    // Subscribe to 'buffers' for that entry — drives both the per-frame
    // readback (in endFrame) and the per-flush drain.
    provider.subscribers.onSubscribe('c1', ['buffers'], undefined, {
      big: { mode: 'thumbnail', thumbSize: 256 },
    })

    // Pump one frame so readbackAll fires and `e.sample` populates.
    provider.beginFrame(performance.now(), renderer)
    provider.endFrame(renderer)
    // The DataTexture readback path is synchronous, so the sample is
    // already in place. Force-feed in case the wiring changes:
    debugTextures.readbackAll(new Map([['big', { mode: 'thumbnail' }]]), renderer)

    flush(provider)

    // (1) Convert was invoked with the raw pixels.
    expect(transport.converts).toHaveLength(1)
    const conv = transport.converts[0]!
    expect(conv.name).toBe('big')
    expect(conv.width).toBe(256)
    expect(conv.height).toBe(256)
    expect(conv.pixelsByteLength).toBe(256 * 256 * 4)

    // (2) A data message was broadcast and it carries metadata for the
    // entry but NOT pixel bytes — `entry.pixels` was stripped post-convert.
    expect(transport.posts).toHaveLength(1)
    const msg = transport.posts[0]! as DebugMessage & {
      payload: { features?: { buffers?: { entries?: Record<string, { pixels?: unknown; width: number }> } } }
    }
    const entries = msg.payload.features?.buffers?.entries
    expect(entries).toBeDefined()
    expect(entries!['big']).toBeDefined()
    expect(entries!['big']!.width).toBe(256)
    expect(entries!['big']!.pixels).toBeUndefined()
  })

  it('does not call convert when there is no pixel subscription', () => {
    const { provider, transport } = makeProvider('no-sub')
    const renderer = mockRenderer()
    const debugTextures = (provider as unknown as { _textures: {
      register: (n: string, t: DataTexture, p: string) => void
      readbackAll: (sub: Map<string, { mode: 'thumbnail' }>, r: WebGPURenderer) => void
    } })._textures
    debugTextures.register('orphan', dataTex(8, 8), 'rgba8')

    // Subscribe to the 'buffers' *feature* (so metadata ships) but with NO
    // entry-level subscription — nobody wants pixels.
    provider.subscribers.onSubscribe('c1', ['buffers'], undefined, {})

    provider.beginFrame(performance.now(), renderer)
    provider.endFrame(renderer)

    flush(provider)

    expect(transport.converts).toHaveLength(0)
    // Metadata-only buffers shape still ships so the picker UI knows what
    // entries exist.
    const msg = transport.posts[0] as DebugMessage & {
      payload: { features?: { buffers?: { entries?: Record<string, { pixels?: unknown }> } } }
    } | undefined
    const entries = msg?.payload.features?.buffers?.entries
    if (entries) {
      // If we did emit, the entry must NOT carry pixels.
      expect(entries['orphan']?.pixels).toBeUndefined()
    }
  })
})
