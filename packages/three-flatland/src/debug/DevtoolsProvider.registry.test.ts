import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevtoolsProvider } from './DevtoolsProvider'
import type { BusTransport, ConvertRequest } from './bus-transport'
import type { DebugMessage, RegistryPayload } from '../debug-protocol'
import { REGISTRY_CHECKPOINT_MS } from '../debug-protocol'

/**
 * Registry checkpoint cadence contract (#29 Phase C slice 3).
 *
 * `_flush` forces a full registry resend — flagged `checkpoint: true`
 * on the wire — every `REGISTRY_CHECKPOINT_MS`, independent of whether
 * anything actually changed. Ordinary flushes in between only carry
 * entries that changed, unflagged.
 */

interface CapturingTransport extends BusTransport {
  readonly posts: DebugMessage[]
}

function mkTransport(): CapturingTransport {
  const posts: DebugMessage[] = []
  return {
    posts,
    codecSupported: false,
    acquireSmall: () => new ArrayBuffer(4 * 1024),
    acquireMedium: () => new ArrayBuffer(256 * 1024),
    acquireLarge: () => new ArrayBuffer(16 * 1024 * 1024),
    post: (msg) => { posts.push(msg) },
    convert: (_req: ConvertRequest) => { /* no-op — no buffers feature exercised here */ },
    releaseUnused: () => { /* no-op */ },
    poolStats: () => ({ smallFree: 0, mediumFree: 0, largeFree: 0 }),
    dispose: () => { /* no-op */ },
  }
}

let active: DevtoolsProvider | null = null

function makeProvider(suffix: string): { provider: DevtoolsProvider; transport: CapturingTransport } {
  const p = new DevtoolsProvider({
    id: `regcheckpoint-${suffix}`,
    discoveryChannelName: `flatland-debug-regcheckpoint-${suffix}`,
  })
  p.start()
  active = p
  const originalTransport = (p as unknown as { _dataTransport: BusTransport })._dataTransport
  const transport = mkTransport()
  const originalApi = originalTransport as { dispose?: () => void; close?: () => void }
  if (originalApi.dispose !== undefined) originalApi.dispose()
  else originalApi.close?.()
  ;(p as unknown as { _dataTransport: BusTransport })._dataTransport = transport
  return { provider: p, transport }
}

/**
 * Ack immediately before flushing, so a test that advances the fake
 * clock past `ACK_GRACE_MS` in one jump (to cross the registry
 * checkpoint cadence) doesn't also trip `SubscriberRegistry.pruneStale`
 * and drop the consumer out from under the assertion — a real consumer
 * would have kept acking every `ACK_INTERVAL_MS` throughout that span.
 */
function flush(provider: DevtoolsProvider, consumerId = 'c1'): void {
  provider.subscribers.onAck(consumerId)
  ;(provider as unknown as { _flush: () => void })._flush()
}

function registryOf(msg: DebugMessage | undefined): RegistryPayload | undefined {
  if (msg === undefined) return undefined
  const payload = (msg as DebugMessage & {
    payload: { features?: { registry?: RegistryPayload | null } }
  }).payload
  return payload.features?.registry ?? undefined
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] })
})

afterEach(() => {
  active?.dispose()
  active = null
  vi.useRealTimers()
})

describe('DevtoolsProvider _flush — registry checkpoint cadence', () => {
  it('flags the first flush with an active registry subscriber as a checkpoint', () => {
    const { provider, transport } = makeProvider('first')
    provider.registry.register('a', new Float32Array([1, 2, 3]), 'float')
    provider.subscribers.onSubscribe('c1', ['registry'], undefined, undefined)
    // A fresh subscribe already forces its own checkpoint via
    // resetDelta(); consume it so the assertion below is about the
    // FIRST-FLUSH-DUE case specifically, not the subscribe-triggered one.
    flush(provider)
    transport.posts.length = 0

    // Advance well past the cadence and touch the entry so there's
    // something to drain either way.
    vi.advanceTimersByTime(REGISTRY_CHECKPOINT_MS + 1)
    provider.registry.touch('a')
    flush(provider)

    expect(transport.posts).toHaveLength(1)
    const reg = registryOf(transport.posts[0])
    expect(reg?.checkpoint).toBe(true)
    expect(reg?.entries?.a?.sample).toBeDefined()
  })

  it('does not flag flushes between checkpoints, even when entries change', () => {
    const { provider, transport } = makeProvider('between')
    provider.registry.register('a', new Float32Array([1]), 'float')
    provider.subscribers.onSubscribe('c1', ['registry'], undefined, undefined)
    flush(provider) // consume the subscribe-triggered checkpoint
    transport.posts.length = 0

    // Several ordinary flushes inside the cadence window — each
    // touches the entry so a delta is always available to inspect.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500)
      provider.registry.touch('a')
      flush(provider)
    }

    expect(transport.posts).toHaveLength(5)
    for (const msg of transport.posts) {
      const reg = registryOf(msg)
      expect(reg?.entries?.a).toBeDefined()
      expect(reg?.checkpoint).toBeUndefined()
    }
  })

  it('re-flags once the cadence elapses again after a checkpoint', () => {
    const { provider, transport } = makeProvider('recur')
    provider.registry.register('a', new Float32Array([1]), 'float')
    provider.subscribers.onSubscribe('c1', ['registry'], undefined, undefined)
    flush(provider) // subscribe-triggered checkpoint
    transport.posts.length = 0

    // Stay under cadence — plain deltas.
    vi.advanceTimersByTime(REGISTRY_CHECKPOINT_MS - 10)
    provider.registry.touch('a')
    flush(provider)
    expect(registryOf(transport.posts[0])?.checkpoint).toBeUndefined()

    // Cross the cadence threshold — next flush checkpoints again.
    vi.advanceTimersByTime(20)
    provider.registry.touch('a')
    flush(provider)
    expect(registryOf(transport.posts[1])?.checkpoint).toBe(true)

    // And the cadence clock re-armed from that checkpoint, not from
    // the original subscribe — immediately after, still a plain delta.
    vi.advanceTimersByTime(10)
    provider.registry.touch('a')
    flush(provider)
    expect(registryOf(transport.posts[2])?.checkpoint).toBeUndefined()
  })

  it('does not run the registry checkpoint clock while nobody subscribes to the feature', () => {
    const { provider, transport } = makeProvider('idle')
    provider.registry.register('a', new Float32Array([1]), 'float')
    // Subscribe to a different feature only — registry stays inactive.
    provider.subscribers.onSubscribe('c1', ['stats'], undefined, undefined)
    flush(provider)
    transport.posts.length = 0

    vi.advanceTimersByTime(REGISTRY_CHECKPOINT_MS * 3)
    provider.registry.touch('a')
    flush(provider)

    // Confirm the flush actually ran (not a vacuous pass because the
    // consumer got pruned) — with nothing to report on 'stats' either,
    // the only thing it can have sent this idle window is a liveness
    // ping, never a registry-bearing data packet.
    expect(transport.posts.length).toBeGreaterThan(0)
    for (const msg of transport.posts) {
      expect(registryOf(msg)).toBeUndefined()
    }
  })
})
