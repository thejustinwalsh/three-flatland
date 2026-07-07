/**
 * WebSocket wire transport for the devtools bus — the remote/mobile
 * debugging path (#114). Serializes `DebugMessage`s through
 * `bus-frame`'s `FrameWriter`/`FrameReader` (fixed 16-byte header +
 * TLV sections) and bridges them to/from the in-process
 * BroadcastChannel bus, which stays byte-for-byte unchanged.
 *
 * Topology: game (provider, possibly on-device) and dashboard
 * (consumer, desktop) each run a bridge connected to a tiny relay
 * (`flatland-devtools-relay` in @three-flatland/devtools) or directly
 * to each other via any WS server that forwards binary frames.
 *
 *   provider BCs ⇄ providerBridge ⇄ ws ⇄ consumerBridge ⇄ dashboard BCs
 *
 * Direction filtering prevents echo: provider→consumer message types
 * and consumer→provider types are disjoint sets, and `rpc:*`
 * (consumer↔consumer) never crosses the wire.
 *
 * Wire frame layout (reusing bus-frame's header + TLV):
 *
 *   header (16B)  type = BUS_TYPE mapped from msg.type
 *   TLV section   WIRE_SECTION.JSON — uint32 channelNameLen + utf8,
 *                 uint32 jsonLen + utf8 JSON (binaries replaced by
 *                 `{ __flBin, ctor, length }` markers)
 *   TLV section*  WIRE_SECTION.BIN — raw bytes per extracted binary,
 *                 in marker order
 */
import type { DebugMessage } from '../debug-protocol'
import {
  BUS_TYPE,
  FrameReader,
  FrameWriter,
  HEADER_BYTES,
  type BusType,
} from './bus-frame'

/** TLV section ids for the WS wire (distinct from data FEATURE_IDs). */
export const WIRE_SECTION = {
  JSON: 100,
  BIN: 101,
} as const

/** Provider → consumer message types (forwarded provider-side → WS). */
const PROVIDER_TO_CONSUMER = new Set<string>([
  'provider:announce',
  'provider:gone',
  'subscribe:ack',
  'data',
  'buffer:chunk',
  'buffer:raw',
  'ping',
])

/** Consumer → provider message types (forwarded consumer-side → WS). */
const CONSUMER_TO_PROVIDER = new Set<string>([
  'provider:query',
  'subscribe',
  'unsubscribe',
  'ack',
])

export function isProviderToConsumer(type: string): boolean {
  return PROVIDER_TO_CONSUMER.has(type)
}

export function isConsumerToProvider(type: string): boolean {
  return CONSUMER_TO_PROVIDER.has(type)
}

/**
 * Stamp on locally re-posted messages that arrived from the wire.
 * A provider bridge and a consumer bridge coexisting in one context
 * (dashboard remote-debugging its own page) would otherwise relay each
 * other's reposts forever — taps skip anything already wire-borne.
 */
const FROM_WIRE_KEY = '__flFromWire'

function markFromWire(msg: DebugMessage): DebugMessage {
  ;(msg as DebugMessage & Record<string, unknown>)[FROM_WIRE_KEY] = true
  return msg
}

function isFromWire(msg: DebugMessage): boolean {
  return (msg as DebugMessage & Record<string, unknown>)[FROM_WIRE_KEY] === true
}

const WIRE_TYPE_BY_MESSAGE: Record<string, BusType> = {
  data: BUS_TYPE.DATA,
  subscribe: BUS_TYPE.SUBSCRIBE,
  'subscribe:ack': BUS_TYPE.SUBSCRIBE_ACK,
  ack: BUS_TYPE.ACK,
  unsubscribe: BUS_TYPE.UNSUBSCRIBE,
  ping: BUS_TYPE.PING,
  'provider:announce': BUS_TYPE.PROVIDER_ANNOUNCE,
  'provider:query': BUS_TYPE.PROVIDER_QUERY,
  'provider:gone': BUS_TYPE.PROVIDER_GONE,
}

interface ExtractedBinary {
  bytes: Uint8Array
  ctor: string
  /** JSON-pointer-ish path (object keys / array indices) to the value. */
  path: (string | number)[]
}

const TYPED_ARRAY_CTORS: Record<string, new (buf: ArrayBuffer) => ArrayBufferView> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
}

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

/**
 * Encode a DebugMessage (+ its origin channel name) into a wire frame.
 * Binary payloads (ArrayBuffers and typed-array views anywhere in the
 * message) travel as raw TLV sections instead of JSON.
 */
export function encodeDebugMessage(msg: DebugMessage, channelName: string): ArrayBuffer {
  const binaries: ExtractedBinary[] = []
  const jsonSafe = extractBinaries(msg, binaries, [], 0)
  // Binary locations travel as an explicit path table alongside the
  // message — no sentinel objects inside user data, so payloads that
  // happen to contain marker-shaped objects can't be corrupted.
  const envelope = {
    m: jsonSafe,
    b: binaries.map((bin) => ({ p: bin.path, c: bin.ctor })),
  }
  const jsonBytes = TEXT_ENCODER.encode(JSON.stringify(envelope))
  const channelBytes = TEXT_ENCODER.encode(channelName)

  let total = HEADER_BYTES
  total += 8 // JSON section TLV header (featureId + sectionBytes)
  total += 4 + channelBytes.byteLength + 4 + jsonBytes.byteLength
  for (const bin of binaries) {
    total += 8 + bin.bytes.byteLength
  }

  const writer = new FrameWriter(new ArrayBuffer(total))
  writer.writeUint32(WIRE_SECTION.JSON)
  writer.writeUint32(4 + channelBytes.byteLength + 4 + jsonBytes.byteLength)
  writer.writeUint32(channelBytes.byteLength)
  writer.writeBytes(channelBytes)
  writer.writeUint32(jsonBytes.byteLength)
  writer.writeBytes(jsonBytes)
  for (const bin of binaries) {
    writer.writeUint32(WIRE_SECTION.BIN)
    writer.writeUint32(bin.bytes.byteLength)
    writer.writeBytes(bin.bytes)
  }
  writer.finalise(WIRE_TYPE_BY_MESSAGE[msg.type] ?? BUS_TYPE.DATA, msg.ts)
  return writer.buffer
}

/** Decode a wire frame back into `{ message, channelName }`. */
export function decodeDebugMessage(buffer: ArrayBuffer): {
  message: DebugMessage
  channelName: string
} {
  const reader = new FrameReader(buffer)
  let channelName = ''
  let jsonSafe: unknown = null
  const binaries: Uint8Array[] = []

  while (reader.bytesRemaining >= 8) {
    const sectionId = reader.readUint32()
    const sectionBytes = reader.readUint32()
    if (sectionId === WIRE_SECTION.JSON) {
      const channelLen = reader.readUint32()
      channelName = TEXT_DECODER.decode(reader.readBytesView(channelLen))
      const jsonLen = reader.readUint32()
      jsonSafe = JSON.parse(TEXT_DECODER.decode(reader.readBytesView(jsonLen)))
    } else if (sectionId === WIRE_SECTION.BIN) {
      // Copy — the reader contract says views die with the buffer.
      binaries.push(new Uint8Array(reader.readBytesView(sectionBytes)))
    } else {
      reader.seek(reader.cursor + sectionBytes)
    }
  }

  const envelope = jsonSafe as {
    m: unknown
    b?: { p: (string | number)[]; c: string }[]
  } | null
  const message = (envelope?.m ?? null) as DebugMessage
  if (envelope?.b) {
    for (let i = 0; i < envelope.b.length; i++) {
      const bytes = binaries[i]
      const entry = envelope.b[i]!
      if (!bytes) continue
      setAtPath(message, entry.p, reviveBinary(bytes, entry.c))
    }
  }
  return { message, channelName }
}

function reviveBinary(bytes: Uint8Array, ctor: string): unknown {
  // Fresh, tightly-sized ArrayBuffer so views line up at offset 0.
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  if (ctor === 'ArrayBuffer') return copy
  const Ctor = TYPED_ARRAY_CTORS[ctor]
  return Ctor ? new Ctor(copy) : copy
}

function setAtPath(root: unknown, path: (string | number)[], value: unknown): void {
  if (path.length === 0) return
  let node: unknown = root
  for (let i = 0; i < path.length - 1; i++) {
    if (node === null || typeof node !== 'object') return
    node = (node as Record<string | number, unknown>)[path[i]!]
  }
  if (node === null || typeof node !== 'object') return
  ;(node as Record<string | number, unknown>)[path[path.length - 1]!] = value
}

const MAX_DEPTH = 16

function extractBinaries(
  value: unknown,
  out: ExtractedBinary[],
  path: (string | number)[],
  depth: number
): unknown {
  if (depth > MAX_DEPTH) return value
  if (value instanceof ArrayBuffer) {
    out.push({ bytes: new Uint8Array(value), ctor: 'ArrayBuffer', path: [...path] })
    return null
  }
  if (ArrayBuffer.isView(value)) {
    out.push({
      bytes: new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ctor: value.constructor.name,
      path: [...path],
    })
    return null
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => extractBinaries(entry, out, [...path, index], depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = extractBinaries(entry, out, [...path, key], depth + 1)
    }
    return result
  }
  return value
}

/* ─────────────────────────── Bridges ──────────────────────────── */

/** Minimal WebSocket surface (browser WebSocket and `ws` both satisfy it). */
export interface WebSocketLike {
  binaryType: string
  readyState: number
  send(data: ArrayBuffer): void
  close(): void
  addEventListener(type: string, listener: (event: never) => void): void
  removeEventListener(type: string, listener: (event: never) => void): void
}

export interface RemoteBridgeHandle {
  dispose(): void
}

export interface ProviderBridgeOptions {
  /** An open (or connecting) WebSocket, or a URL to connect to. */
  remote: WebSocketLike | string
  /** The provider's per-provider data channel name. */
  dataChannelName: string
  /** The discovery channel name. */
  discoveryChannelName: string
  /**
   * Provider id — lets the bridge send `provider:gone` over the wire
   * synchronously on dispose (BroadcastChannel delivery is async, so
   * the provider's own goodbye can't reach the tap before it closes).
   */
  providerId?: string
}

/**
 * Provider-side bridge: taps the provider's BroadcastChannels
 * (in-process bus untouched) and mirrors provider→consumer traffic to
 * the socket; decoded consumer→provider traffic is re-posted onto the
 * matching local channel, where the provider picks it up exactly as if
 * a local consumer had sent it.
 */
export function createProviderRemoteBridge(options: ProviderBridgeOptions): RemoteBridgeHandle {
  const socket = resolveSocket(options.remote)
  const sender = createWireSender(socket)
  const dataTap = new BroadcastChannel(options.dataChannelName)
  const discoveryTap = new BroadcastChannel(options.discoveryChannelName)

  const forward = (channelName: string) => (ev: MessageEvent<DebugMessage>) => {
    const msg = ev.data
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return
    if (isFromWire(msg)) return // already crossed once — never echo
    if (!isProviderToConsumer(msg.type)) return
    sender.send(() => encodeDebugMessage(msg, channelName))
  }
  const onData = forward(options.dataChannelName)
  const onDiscovery = forward(options.discoveryChannelName)
  dataTap.addEventListener('message', onData as EventListener)
  discoveryTap.addEventListener('message', onDiscovery as EventListener)

  const onSocketMessage = (ev: MessageEvent): void => {
    const data = ev.data as ArrayBuffer
    if (!(data instanceof ArrayBuffer)) return
    const { message } = decodeDebugMessage(data)
    if (!isConsumerToProvider(message.type)) return
    // provider:query belongs on discovery; everything else on data.
    markFromWire(message)
    if (message.type === 'provider:query') discoveryTap.postMessage(message)
    else dataTap.postMessage(message)
  }
  socket.addEventListener('message', onSocketMessage as never)

  return {
    dispose(): void {
      if (options.providerId !== undefined && socket.readyState === WS_OPEN) {
        // Goodbye only crosses on an open socket — queueing it against
        // a connecting socket from a dead bridge is the stale-frame bug.
        sender.send(() =>
          encodeDebugMessage(
            {
              v: 1,
              ts: Date.now(),
              type: 'provider:gone',
              payload: { id: options.providerId! },
            },
            options.discoveryChannelName
          )
        )
      }
      sender.dispose()
      socket.removeEventListener('message', onSocketMessage as never)
      dataTap.close()
      discoveryTap.close()
      maybeCloseOwned(socket, options.remote)
    },
  }
}

export interface ConsumerBridgeOptions {
  /** An open (or connecting) WebSocket, or a URL to connect to. */
  remote: WebSocketLike | string
  /** The discovery channel name (defaults handled by the caller). */
  discoveryChannelName: string
}

/**
 * Consumer/dashboard-side bridge: decoded provider traffic is posted
 * onto the local channels (the dashboard sees a remote provider exactly
 * like a local one); consumer control traffic on those channels is
 * encoded back over the socket. Per-provider data channels are learned
 * lazily from the frames' channel tags.
 */
export function createConsumerRemoteBridge(options: ConsumerBridgeOptions): RemoteBridgeHandle {
  const socket = resolveSocket(options.remote)
  const sender = createWireSender(socket)
  const channels = new Map<string, BroadcastChannel>()
  let disposed = false

  const openChannel = (name: string): BroadcastChannel => {
    let channel = channels.get(name)
    if (!channel) {
      channel = new BroadcastChannel(name)
      channel.addEventListener('message', ((ev: MessageEvent<DebugMessage>) => {
        const msg = ev.data
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return
        if (isFromWire(msg)) return // already crossed once — never echo
        if (!isConsumerToProvider(msg.type)) return
        sender.send(() => encodeDebugMessage(msg, name))
      }) as EventListener)
      channels.set(name, channel)
    }
    return channel
  }

  // Discovery is always bridged: dashboard provider:query broadcasts
  // reach the remote provider even before any announce arrived.
  openChannel(options.discoveryChannelName)

  const onSocketMessage = (ev: MessageEvent): void => {
    if (disposed) return
    const data = ev.data as ArrayBuffer
    if (!(data instanceof ArrayBuffer)) return
    const { message, channelName } = decodeDebugMessage(data)
    if (!isProviderToConsumer(message.type)) return
    openChannel(channelName).postMessage(markFromWire(message))
  }
  socket.addEventListener('message', onSocketMessage as never)

  return {
    dispose(): void {
      disposed = true
      sender.dispose()
      socket.removeEventListener('message', onSocketMessage as never)
      for (const channel of channels.values()) channel.close()
      channels.clear()
      maybeCloseOwned(socket, options.remote)
    },
  }
}

function resolveSocket(remote: WebSocketLike | string): WebSocketLike {
  const socket =
    typeof remote === 'string'
      ? (new WebSocket(remote) as unknown as WebSocketLike)
      : remote
  socket.binaryType = 'arraybuffer'
  return socket
}

const WS_OPEN = 1
const WS_CONNECTING = 0

interface WireSender {
  send(encode: () => ArrayBuffer): void
  /** Detach every queued open-callback (bridge dispose). */
  dispose(): void
}

/**
 * Send wrapper bound to a bridge lifetime: frames queued while the
 * socket is CONNECTING flush on open, and dispose detaches every
 * queued callback so a caller-owned socket that opens later doesn't
 * emit stale frames from a dead bridge.
 */
function createWireSender(socket: WebSocketLike): WireSender {
  const pending = new Set<() => void>()
  let disposed = false

  return {
    send(encode: () => ArrayBuffer): void {
      if (disposed) return
      if (socket.readyState === WS_OPEN) {
        socket.send(encode())
      } else if (socket.readyState === WS_CONNECTING) {
        const frame = encode()
        const onOpen = (): void => {
          socket.removeEventListener('open', onOpen as never)
          pending.delete(onOpen)
          if (disposed) return
          try {
            socket.send(frame)
          } catch {
            /* socket died between open and send */
          }
        }
        pending.add(onOpen)
        socket.addEventListener('open', onOpen as never)
      }
      // CLOSING/CLOSED: drop — liveness pings will resume on reconnect.
    },
    dispose(): void {
      disposed = true
      for (const onOpen of pending) {
        socket.removeEventListener('open', onOpen as never)
      }
      pending.clear()
    },
  }
}

function maybeCloseOwned(socket: WebSocketLike, original: WebSocketLike | string): void {
  // Only close sockets we created from a URL; caller-supplied sockets
  // belong to the caller.
  if (typeof original === 'string') {
    try {
      socket.close()
    } catch {
      /* already closed */
    }
  }
}
