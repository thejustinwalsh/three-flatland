import { describe, it, expect, vi } from 'vitest'
import type { DebugMessage } from '../debug-protocol'
import {
  createConsumerRemoteBridge,
  createProviderRemoteBridge,
  decodeDebugMessage,
  encodeDebugMessage,
  isConsumerToProvider,
  isProviderToConsumer,
  type WebSocketLike,
} from './bus-websocket'
import { BUS_TYPE, FrameReader } from './bus-frame'

/** Minimal in-memory WebSocket pair for bridge tests. */
class FakeSocket implements WebSocketLike {
  binaryType = 'arraybuffer'
  readyState = 1 // OPEN
  peer: FakeSocket | null = null
  sent: ArrayBuffer[] = []
  private _listeners = new Map<string, Set<(ev: never) => void>>()

  send(data: ArrayBuffer): void {
    this.sent.push(data)
    this.peer?._emit('message', { data })
  }
  close(): void {
    this.readyState = 3
  }
  addEventListener(type: string, listener: (ev: never) => void): void {
    let set = this._listeners.get(type)
    if (!set) {
      set = new Set()
      this._listeners.set(type, set)
    }
    set.add(listener)
  }
  removeEventListener(type: string, listener: (ev: never) => void): void {
    this._listeners.get(type)?.delete(listener)
  }
  _emit(type: string, event: unknown): void {
    for (const listener of this._listeners.get(type) ?? []) {
      ;(listener as (ev: unknown) => void)(event)
    }
  }
}

function socketPair(): [FakeSocket, FakeSocket] {
  const a = new FakeSocket()
  const b = new FakeSocket()
  a.peer = b
  b.peer = a
  return [a, b]
}

describe('wire codec — round-trip parity', () => {
  it('stats data payload with typed arrays survives encode → decode', () => {
    const samples = new Float32Array([16.6, 16.9, 17.1, 15.8])
    const frames = new Uint32Array([100, 101, 102, 103])
    const msg = {
      v: 1,
      ts: 1234567890123,
      type: 'data',
      payload: {
        frame: 103,
        features: {
          stats: { samples, frames, fps: 60 },
        },
      },
    } as unknown as DebugMessage

    const frame = encodeDebugMessage(msg, 'fl-data-abc')
    const { message, channelName } = decodeDebugMessage(frame)

    expect(channelName).toBe('fl-data-abc')
    expect(message.type).toBe('data')
    expect(message.ts).toBe(1234567890123)
    const decoded = (
      message as unknown as {
        payload: { features: { stats: { samples: Float32Array; frames: Uint32Array; fps: number } } }
      }
    ).payload.features.stats
    expect(decoded.samples).toBeInstanceOf(Float32Array)
    expect([...decoded.samples]).toEqual([...samples])
    expect(decoded.frames).toBeInstanceOf(Uint32Array)
    expect([...decoded.frames]).toEqual([...frames])
    expect(decoded.fps).toBe(60)

    // Header reuses bus-frame's format
    const reader = new FrameReader(frame)
    expect(reader.type).toBe(BUS_TYPE.DATA)
    expect(reader.ts).toBe(1234567890123)
    expect(reader.usedBytes).toBe(frame.byteLength)
  })

  it('buffer:raw payload with a large ArrayBuffer survives encode → decode', () => {
    const pixels = new ArrayBuffer(64 * 64 * 4)
    new Uint8Array(pixels).forEach((_, i, arr) => {
      arr[i] = i % 251
    })
    const msg = {
      v: 1,
      ts: 42,
      type: 'buffer:raw',
      payload: { name: 'occlusion.mask', frame: 7, width: 64, height: 64, data: pixels },
    } as unknown as DebugMessage

    const { message } = decodeDebugMessage(encodeDebugMessage(msg, 'fl-data-xyz'))
    const decoded = (message as unknown as { payload: { data: ArrayBuffer } }).payload.data
    expect(decoded).toBeInstanceOf(ArrayBuffer)
    expect(decoded.byteLength).toBe(pixels.byteLength)
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(pixels))
  })

  it('control messages map to their bus-frame header types', () => {
    const subscribe = {
      v: 1,
      ts: 5,
      type: 'subscribe',
      payload: { providerId: 'p1', features: ['stats'] },
    } as unknown as DebugMessage
    const reader = new FrameReader(encodeDebugMessage(subscribe, 'fl-data-p1'))
    expect(reader.type).toBe(BUS_TYPE.SUBSCRIBE)
  })
})

describe('direction filtering', () => {
  it('provider→consumer and consumer→provider sets are disjoint; rpc stays local', () => {
    for (const type of ['data', 'ping', 'subscribe:ack', 'buffer:raw', 'provider:announce']) {
      expect(isProviderToConsumer(type)).toBe(true)
      expect(isConsumerToProvider(type)).toBe(false)
    }
    for (const type of ['subscribe', 'unsubscribe', 'ack', 'provider:query']) {
      expect(isConsumerToProvider(type)).toBe(true)
      expect(isProviderToConsumer(type)).toBe(false)
    }
    expect(isProviderToConsumer('rpc:ui:expand')).toBe(false)
    expect(isConsumerToProvider('rpc:ui:expand')).toBe(false)
  })
})

describe('remote bridges over a socket pair', () => {
  it('provider traffic reaches the consumer side channels; control flows back', async () => {
    const [providerSocket, consumerSocket] = socketPair()
    const providerBridge = createProviderRemoteBridge({
      remote: providerSocket,
      dataChannelName: 'fl-data-remote1',
      discoveryChannelName: 'fl-discovery-test',
      providerId: 'remote1',
    })
    const consumerBridge = createConsumerRemoteBridge({
      remote: consumerSocket,
      discoveryChannelName: 'fl-discovery-test',
    })

    // Dashboard-side listener (what a consumer would see locally)
    const consumerSeen: DebugMessage[] = []
    const dashboardDiscovery = new BroadcastChannel('fl-discovery-test')
    dashboardDiscovery.addEventListener('message', (ev) => {
      consumerSeen.push(ev.data as DebugMessage)
    })

    // Provider announces on ITS discovery channel (as DevtoolsProvider does)
    const providerDiscovery = new BroadcastChannel('fl-discovery-test')
    providerDiscovery.postMessage({
      v: 1,
      ts: 1,
      type: 'provider:announce',
      payload: { id: 'remote1', name: 'game', kind: 'user' },
    })

    // BroadcastChannel delivery is a macrotask
    await new Promise((resolve) => setTimeout(resolve, 20))

    // NOTE: the local dashboardDiscovery ALSO hears the direct local
    // announce (same process in tests). The wire path is proven by the
    // provider socket having sent an encoded frame:
    expect(providerSocket.sent.length).toBeGreaterThanOrEqual(1)
    const wireAnnounce = decodeDebugMessage(providerSocket.sent[0]!)
    expect(wireAnnounce.message.type).toBe('provider:announce')
    expect(consumerSeen.some((m) => m.type === 'provider:announce')).toBe(true)

    // Dashboard subscribes on the provider's data channel → crosses back
    const dashboardData = new BroadcastChannel('fl-data-remote1')
    const providerReceived: DebugMessage[] = []
    const providerData = new BroadcastChannel('fl-data-remote1')
    providerData.addEventListener('message', (ev) => {
      providerReceived.push(ev.data as DebugMessage)
    })

    // Consumer bridge learns the data channel from a data frame first
    providerSocket.send(
      encodeDebugMessage(
        { v: 1, ts: 2, type: 'ping', payload: {} } as unknown as DebugMessage,
        'fl-data-remote1'
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    dashboardData.postMessage({
      v: 1,
      ts: 3,
      type: 'subscribe',
      payload: { providerId: 'remote1', features: ['stats'] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(providerReceived.some((m) => m.type === 'subscribe')).toBe(true)

    providerBridge.dispose()
    consumerBridge.dispose()
    dashboardDiscovery.close()
    dashboardData.close()
    providerDiscovery.close()
    providerData.close()
  })

  it('bridge dispose sends provider:gone over the wire synchronously', () => {
    const [providerSocket, consumerSocket] = socketPair()
    const seen: DebugMessage[] = []
    consumerSocket.addEventListener('message', ((ev: { data: ArrayBuffer }) => {
      seen.push(decodeDebugMessage(ev.data).message)
    }) as never)

    const bridge = createProviderRemoteBridge({
      remote: providerSocket,
      dataChannelName: 'fl-data-gone',
      discoveryChannelName: 'fl-discovery-gone',
      providerId: 'gone1',
    })
    bridge.dispose()

    expect(seen.some((m) => m.type === 'provider:gone')).toBe(true)
  })

  it('a disposed bridge never emits queued frames when the socket opens later', async () => {
    const socket = new FakeSocket()
    socket.readyState = 0 // CONNECTING
    const bridge = createProviderRemoteBridge({
      remote: socket,
      dataChannelName: 'fl-data-conn',
      discoveryChannelName: 'fl-discovery-conn',
      providerId: 'conn1',
    })
    // A provider message queues against the connecting socket…
    const local = new BroadcastChannel('fl-data-conn')
    local.postMessage({ v: 1, ts: 1, type: 'ping', payload: {} })
    await new Promise((resolve) => setTimeout(resolve, 20))

    bridge.dispose() // …then the bridge dies before the socket opens

    socket.readyState = 1
    socket._emit('open', {})
    // Nothing from the dead bridge — no stale ping, no goodbye either
    // (provider:gone only crosses an OPEN socket at dispose time).
    expect(socket.sent.length).toBe(0)
    local.close()
  })

  it('wire-borne reposts are never re-forwarded (same-context echo guard)', async () => {
    const [providerSocket, consumerSocket] = socketPair()
    const providerBridge = createProviderRemoteBridge({
      remote: providerSocket,
      dataChannelName: 'fl-data-echo',
      discoveryChannelName: 'fl-discovery-echo',
    })
    const consumerBridge = createConsumerRemoteBridge({
      remote: consumerSocket,
      discoveryChannelName: 'fl-discovery-echo',
    })

    // A remote data frame arrives at the consumer bridge, which reposts
    // it locally — the provider bridge tap in the SAME context must not
    // send it back out (infinite relay ping-pong otherwise).
    const sentBefore = providerSocket.sent.length
    consumerSocket.peer = providerSocket // wire back
    providerSocket.send(
      encodeDebugMessage(
        { v: 1, ts: 9, type: 'ping', payload: {} } as unknown as DebugMessage,
        'fl-data-echo'
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Exactly the frame we sent — no echo copies queued afterwards.
    expect(providerSocket.sent.length).toBe(sentBefore + 1)

    providerBridge.dispose()
    consumerBridge.dispose()
  })

  it('marker-shaped user payloads survive the codec untouched (path table)', () => {
    const msg = {
      v: 1,
      ts: 7,
      type: 'data',
      payload: {
        frame: 1,
        features: {
          registry: {
            // User data that LOOKS like an internal binary marker
            meta: { __flBin: 0, ctor: 'Uint8Array' },
            real: new Uint8Array([1, 2, 3]),
          },
        },
      },
    } as unknown as DebugMessage

    const { message } = decodeDebugMessage(encodeDebugMessage(msg, 'fl-data-x'))
    const decoded = (
      message as unknown as {
        payload: { features: { registry: { meta: unknown; real: Uint8Array } } }
      }
    ).payload.features.registry
    expect(decoded.meta).toEqual({ __flBin: 0, ctor: 'Uint8Array' })
    expect(decoded.real).toBeInstanceOf(Uint8Array)
    expect([...decoded.real]).toEqual([1, 2, 3])
  })

  it('malformed / non-binary socket payloads are ignored', () => {
    const socket = new FakeSocket()
    const bridge = createConsumerRemoteBridge({
      remote: socket,
      discoveryChannelName: 'fl-discovery-junk',
    })
    expect(() => socket._emit('message', { data: 'not-binary' })).not.toThrow()
    bridge.dispose()
  })

  it('provider bridge only forwards provider→consumer types', async () => {
    const [providerSocket] = socketPair()
    const bridge = createProviderRemoteBridge({
      remote: providerSocket,
      dataChannelName: 'fl-data-filter',
      discoveryChannelName: 'fl-discovery-filter',
    })

    const local = new BroadcastChannel('fl-data-filter')
    // A consumer-origin message on the local bus must NOT echo to the wire
    local.postMessage({ v: 1, ts: 1, type: 'subscribe', payload: { providerId: 'x' } })
    // An rpc consumer↔consumer message must not cross either
    local.postMessage({ v: 1, ts: 2, type: 'rpc:ui:expand', payload: {} })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(providerSocket.sent.length).toBe(0)

    bridge.dispose()
    local.close()
    expect(vi.isFakeTimers()).toBe(false)
  })
})
