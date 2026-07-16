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

/**
 * Resolves the first time `channel` receives a message matching
 * `predicate`. Attach this BEFORE the action that will post the awaited
 * message — the returned promise is the signal, never a timer.
 */
function waitForMessage(
  channel: BroadcastChannel,
  predicate: (msg: DebugMessage) => boolean
): Promise<DebugMessage> {
  return new Promise((resolve) => {
    const onMessage = (ev: MessageEvent): void => {
      const msg = ev.data as DebugMessage
      if (!predicate(msg)) return
      channel.removeEventListener('message', onMessage)
      resolve(msg)
    }
    channel.addEventListener('message', onMessage)
  })
}

/**
 * Resolves with the frame the next time `socket.send()` is called — the
 * deterministic "this crossed the wire" signal, in place of waiting a
 * fixed delay and then inspecting `socket.sent`.
 *
 * Only valid as a POSITIVE-path barrier ("prove this message crossed").
 * As a "drained queue" barrier ahead of a negative assertion (`sent
 * .length` stayed put), it's a false barrier: it resolves on whichever
 * send happens to land FIRST, so an erroneous forward that should have
 * been dropped satisfies it instead of the intended barrier message,
 * and the length check that follows can't tell the difference. Use
 * `nextSendMatching` for that case.
 */
function nextSend(socket: FakeSocket): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const original = socket.send.bind(socket)
    socket.send = (data: ArrayBuffer): void => {
      socket.send = original
      original(data)
      resolve(data)
    }
  })
}

/**
 * Resolves the first time `socket.send()` is called with a frame whose
 * decoded message satisfies `predicate` — a barrier tied to a SPECIFIC
 * message's identity rather than "whatever sends first". Every send
 * (matching or not) still runs through to `socket.sent`, so a preceding
 * erroneous send — the exact bug a negative-guard test exists to catch —
 * is captured before the length assertion that follows the barrier runs.
 */
function nextSendMatching(
  socket: FakeSocket,
  predicate: (msg: DebugMessage) => boolean
): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const original = socket.send.bind(socket)
    socket.send = (data: ArrayBuffer): void => {
      original(data)
      const { message } = decodeDebugMessage(data)
      if (predicate(message)) {
        socket.send = original
        resolve(data)
      }
    }
  })
}

/**
 * Resolves the first time an event listener of `type` is registered on
 * `socket` — used to detect the moment a queued send (against a
 * CONNECTING socket) registers its flush-on-open callback.
 */
function waitForListenerRegistered(socket: FakeSocket, type: string): Promise<void> {
  return new Promise((resolve) => {
    const originalAdd = socket.addEventListener.bind(socket)
    socket.addEventListener = (listenerType: string, listener: (ev: never) => void): void => {
      originalAdd(listenerType, listener)
      if (listenerType === type) {
        socket.addEventListener = originalAdd
        resolve()
      }
    }
  })
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
        payload: {
          features: { stats: { samples: Float32Array; frames: Uint32Array; fps: number } }
        }
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
    const dashboardSawAnnounce = waitForMessage(dashboardDiscovery, (msg) => {
      consumerSeen.push(msg)
      return msg.type === 'provider:announce'
    })

    // Provider announces on ITS discovery channel (as DevtoolsProvider does)
    const providerDiscovery = new BroadcastChannel('fl-discovery-test')
    const announceCrossedWire = nextSend(providerSocket)
    providerDiscovery.postMessage({
      v: 1,
      ts: 1,
      type: 'provider:announce',
      payload: { id: 'remote1', name: 'game', kind: 'user' },
    })

    // NOTE: the local dashboardDiscovery ALSO hears the direct local
    // announce (same process in tests). The wire path is proven by the
    // provider socket actually having sent an encoded frame — awaited
    // directly instead of assumed after a fixed delay.
    await Promise.all([dashboardSawAnnounce, announceCrossedWire])
    expect(providerSocket.sent.length).toBeGreaterThanOrEqual(1)
    const wireAnnounce = decodeDebugMessage(providerSocket.sent[0]!)
    expect(wireAnnounce.message.type).toBe('provider:announce')
    expect(consumerSeen.some((m) => m.type === 'provider:announce')).toBe(true)

    // Dashboard subscribes on the provider's data channel → crosses back
    const dashboardData = new BroadcastChannel('fl-data-remote1')
    const providerReceived: DebugMessage[] = []
    const providerData = new BroadcastChannel('fl-data-remote1')
    const subscribeSeen = waitForMessage(providerData, (msg) => {
      providerReceived.push(msg)
      return msg.type === 'subscribe'
    })

    // Consumer bridge learns the data channel from a data frame first.
    // FakeSocket.send() is synchronous end-to-end (unlike a real
    // BroadcastChannel post), so the consumer bridge has already opened
    // the 'fl-data-remote1' channel by the time send() returns — no wait
    // needed here.
    providerSocket.send(
      encodeDebugMessage(
        { v: 1, ts: 2, type: 'ping', payload: {} } as unknown as DebugMessage,
        'fl-data-remote1'
      )
    )

    dashboardData.postMessage({
      v: 1,
      ts: 3,
      type: 'subscribe',
      payload: { providerId: 'remote1', features: ['stats'] },
    })
    await subscribeSeen

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
    // A provider message queues against the connecting socket — the
    // sender registers an 'open' listener to flush it once the socket
    // connects. That registration is the signal the frame was queued.
    const queued = waitForListenerRegistered(socket, 'open')
    const local = new BroadcastChannel('fl-data-conn')
    local.postMessage({ v: 1, ts: 1, type: 'ping', payload: {} })
    await queued

    bridge.dispose() // …then the bridge dies before the socket opens

    socket.readyState = 1
    socket._emit('open', {})
    // Nothing from the dead bridge — no stale ping, no goodbye either
    // (provider:gone only crosses an OPEN socket at dispose time).
    expect(socket.sent.length).toBe(0)
    local.close()
  })

  it('wire-borne reposts are never re-forwarded (same-context echo guard)', async () => {
    const [providerSocket] = socketPair()
    const providerBridge = createProviderRemoteBridge({
      remote: providerSocket,
      dataChannelName: 'fl-data-echo',
      discoveryChannelName: 'fl-discovery-echo',
    })

    // Drive the provider bridge's dataTap directly with a hand-stamped
    // FROM_WIRE marker — the same private marker createConsumerRemoteBridge
    // applies (bus-websocket.ts's FROM_WIRE_KEY) to every message it
    // reposts locally — instead of routing through a real consumer bridge
    // to produce it. That lets the marked frame and the barrier that
    // proves it was processed travel through the SAME BroadcastChannel
    // object: real BroadcastChannel delivery only guarantees ordering for
    // messages posted by the SAME sending object, not across independent
    // senders (a previous version of this test posted the barrier from a
    // second, unrelated BroadcastChannel instance fed by the consumer
    // bridge's internal channel — an invalid barrier that could pass even
    // if the echo guard were broken, since nothing orders two different
    // senders' deliveries relative to each other). Routing both messages
    // through consumerBridge isn't an option either: every message it
    // reposts gets marked FROM_WIRE, so there would be no way to produce
    // an un-marked, forwardable barrier through that same object.
    const sentBefore = providerSocket.sent.length
    const driverChannel = new BroadcastChannel('fl-data-echo')

    // Matched on the barrier's own unique `ts` (10), not "whichever send
    // happens first" — if the echo guard were broken and forwarded the
    // marked message too, that erroneous send (ts: 9) would still land in
    // `providerSocket.sent` but would NOT satisfy this predicate, so the
    // length assertion below would correctly see it.
    const barrierCrossed = nextSendMatching(providerSocket, (msg) => msg.ts === 10)
    driverChannel.postMessage({
      v: 1,
      ts: 9,
      type: 'ping',
      payload: {},
      __flFromWire: true,
    } as unknown as DebugMessage)
    // Same object, posted immediately after — if this barrier crosses the
    // wire, the marked message above (posted first, from the same
    // sender, so FIFO holds) was necessarily already dispatched to the
    // provider tap's listener and dropped by the echo guard.
    driverChannel.postMessage({
      v: 1,
      ts: 10,
      type: 'ping',
      payload: {},
    } as unknown as DebugMessage)
    await barrierCrossed
    driverChannel.close()

    // Only the unmarked barrier crossed — the FROM_WIRE-marked message
    // was silently dropped, not re-forwarded.
    expect(providerSocket.sent.length).toBe(sentBefore + 1)

    providerBridge.dispose()
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

    // Negative-test barrier: post a forwardable frame after the two that
    // must be dropped, and wait for IT — specifically, by its unique `ts`
    // (3) — to cross the wire. BroadcastChannel delivery preserves posting
    // order, so the barrier crossing proves the two prior messages were
    // already dispatched to the provider tap and silently ignored — a
    // deterministic drained-queue signal instead of "nothing happened for
    // N ms". Matching on identity (not "whichever send happens first")
    // matters here: if the filter were broken and forwarded the subscribe
    // or rpc message too, that erroneous send would land in
    // `providerSocket.sent` but not satisfy this predicate, so the length
    // assertion below would still see it.
    const barrierCrossed = nextSendMatching(providerSocket, (msg) => msg.ts === 3)
    local.postMessage({ v: 1, ts: 3, type: 'ping', payload: {} })
    await barrierCrossed

    // Only the barrier itself crossed — the subscribe/rpc messages did not.
    expect(providerSocket.sent.length).toBe(1)

    bridge.dispose()
    local.close()
    expect(vi.isFakeTimers()).toBe(false)
  })
})
