import { describe, it, expect, afterEach } from 'vitest'
import { connect } from 'node:net'
import type { Socket, AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { startRelay } from './relay'
import type { RelayHandle } from './relay'

// Mirrors the private constant in relay.ts (not exported — the two
// boundary tests below need it to size their payloads).
const MAX_PAYLOAD = 16 * 1024 * 1024
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
// RFC 6455 section 1.3's own worked example Sec-WebSocket-Key — fixed
// rather than Math.random()-generated, since nothing in these tests
// depends on key uniqueness (no test compares two handshakes' keys/accept
// values against each other) and a random key buys no coverage here.
const FIXED_WS_KEY = 'dGhlIHNhbXBsZSBub25jZQ=='

// ============================================
// Frame plumbing — hand-rolled RFC 6455, independent of relay.ts's own
// (private) implementation so the test doesn't just mirror the code
// under test.
// ============================================

interface WsFrame {
  opcode: number
  fin: boolean
  payload: Buffer
}

/** Build a masked client→server frame (RFC 6455 requires client frames masked). */
function buildClientFrame(opcode: number, payload: Buffer, fin = true): Buffer {
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78])
  const masked = Buffer.allocUnsafe(payload.length)
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i]! ^ mask[i % 4]!

  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | payload.length])
  } else if (payload.length < 0x10000) {
    header = Buffer.alloc(4)
    header[0] = (fin ? 0x80 : 0) | opcode
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = (fin ? 0x80 : 0) | opcode
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  return Buffer.concat([header, mask, masked])
}

/** Build an unmasked client→server frame — invalid per RFC 6455 §5.1, used to prove the relay rejects it. */
function buildUnmaskedFrame(opcode: number, payload: Buffer, fin = true): Buffer {
  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([(fin ? 0x80 : 0) | opcode, payload.length])
  } else if (payload.length < 0x10000) {
    header = Buffer.alloc(4)
    header[0] = (fin ? 0x80 : 0) | opcode
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = (fin ? 0x80 : 0) | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  return Buffer.concat([header, payload]) // no mask bit, no mask key
}

/** Raw header declaring a length past MAX_PAYLOAD, with no body — the relay must reject on the declared length alone. */
function buildOversizeHeader(declaredLength: number): Buffer {
  const header = Buffer.alloc(10)
  header[0] = 0x80 | 0x2 // fin, binary
  header[1] = 0x80 | 127 // masked, 64-bit extended length
  header.writeBigUInt64BE(BigInt(declaredLength), 2)
  return header
}

/** Parse one unmasked server→client frame from the front of `buf` (null if incomplete). */
function parseServerFrame(buf: Buffer): { opcode: number; fin: boolean; payload: Buffer; rest: Buffer } | null {
  if (buf.length < 2) return null
  const fin = (buf[0]! & 0x80) !== 0
  const opcode = buf[0]! & 0x0f
  let len = buf[1]! & 0x7f
  let offset = 2
  if (len === 126) {
    if (buf.length < 4) return null
    len = buf.readUInt16BE(2)
    offset = 4
  } else if (len === 127) {
    if (buf.length < 10) return null
    len = Number(buf.readBigUInt64BE(2))
    offset = 10
  }
  if (buf.length < offset + len) return null
  return {
    opcode,
    fin,
    payload: Buffer.from(buf.subarray(offset, offset + len)),
    rest: buf.subarray(offset + len),
  }
}

/** Buffers incoming bytes on a socket and resolves frames one at a time as they complete. */
class FrameReader {
  private buffer = Buffer.alloc(0)
  private waiting: Array<(frame: WsFrame) => void> = []

  constructor(socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.flush()
    })
  }

  seed(bytes: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, bytes])
    this.flush()
  }

  private flush(): void {
    while (this.waiting.length > 0) {
      const parsed = parseServerFrame(this.buffer)
      if (!parsed) return
      this.buffer = parsed.rest
      this.waiting.shift()!({ opcode: parsed.opcode, fin: parsed.fin, payload: parsed.payload })
    }
  }

  /**
   * Resolves with the next frame as it completes. No internal deadline —
   * if the relay never sends a frame, the promise never settles and
   * vitest's own per-test timeout is the sole hard-failure ceiling.
   */
  next(): Promise<WsFrame> {
    return new Promise((resolve) => {
      this.waiting.push((frame) => {
        resolve(frame)
      })
      this.flush()
    })
  }
}

/**
 * Waits for a socket's `close` event (used to assert the relay destroyed a
 * connection). No internal deadline — vitest's per-test timeout is the only
 * ceiling if the socket never closes.
 */
function waitClose(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => {
      resolve()
    })
  })
}

/** Perform the HTTP/1.1 upgrade handshake over an already-connected raw socket. */
async function handshake(
  socket: Socket,
  port: number,
  version = '13'
): Promise<{ statusLine: string; key: string; accept: string | null; leftover: Buffer }> {
  const key = FIXED_WS_KEY
  const req =
    'GET / HTTP/1.1\r\n' +
    `Host: 127.0.0.1:${port}\r\n` +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: ${version}\r\n\r\n`

  const raw = await new Promise<Buffer>((resolve) => {
    let acc = Buffer.alloc(0)
    const onData = (chunk: Buffer): void => {
      acc = Buffer.concat([acc, chunk])
      if (acc.includes('\r\n\r\n')) {
        socket.off('data', onData)
        resolve(acc)
      }
    }
    socket.on('data', onData)
    socket.write(req)
  })

  const headerText = raw.toString('latin1')
  const idx = headerText.indexOf('\r\n\r\n')
  const statusLine = headerText.split('\r\n')[0]!
  const acceptMatch = /Sec-WebSocket-Accept:\s*(\S+)/i.exec(headerText)
  const leftover = raw.subarray(idx + 4)
  return { statusLine, key, accept: acceptMatch?.[1] ?? null, leftover }
}

function connectSocket(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

// ============================================
// Test scaffolding — start a relay on an ephemeral port per test,
// clean up sockets + server afterward.
// ============================================

let cleanup: Array<() => void> = []

afterEach(() => {
  for (const fn of cleanup.splice(0)) {
    try {
      fn()
    } catch {
      // best-effort teardown
    }
  }
})

async function openRelay(): Promise<{ relay: RelayHandle; port: number }> {
  const relay = startRelay(0, '127.0.0.1')
  await new Promise<void>((resolve) => relay.server.once('listening', resolve))
  cleanup.push(() => relay.close())
  const port = (relay.server.address() as AddressInfo).port
  return { relay, port }
}

async function openClient(
  port: number,
  version = '13'
): Promise<{
  socket: Socket
  reader: FrameReader
  statusLine: string
  key: string
  accept: string | null
}> {
  const socket = await connectSocket(port)
  cleanup.push(() => socket.destroy())
  const { statusLine, key, accept, leftover } = await handshake(socket, port, version)
  const reader = new FrameReader(socket)
  reader.seed(leftover)
  return { socket, reader, statusLine, key, accept }
}

// ============================================

describe('flatland-devtools-relay', () => {
  it('computes the correct Sec-WebSocket-Accept for the handshake', async () => {
    const { port } = await openRelay()
    const { statusLine, key, accept } = await openClient(port)

    expect(statusLine).toContain('101')
    const expected = createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64')
    expect(accept).toBe(expected)
  })

  it('rejects a handshake with Sec-WebSocket-Version !== 13 with 426 and destroys the socket', async () => {
    const { port } = await openRelay()
    const socket = await connectSocket(port)
    cleanup.push(() => socket.destroy())

    const key = FIXED_WS_KEY
    const req =
      'GET / HTTP/1.1\r\n' +
      `Host: 127.0.0.1:${port}\r\n` +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${key}\r\n` +
      'Sec-WebSocket-Version: 8\r\n\r\n'

    // Read until the socket actually closes rather than stopping at the
    // first sight of a header terminator — proves the 426 response was
    // fully flushed before the connection ended (`write()` immediately
    // followed by `destroy()` could otherwise truncate it under
    // backpressure; this is flush-safe against that regression).
    const raw = await new Promise<Buffer>((resolve) => {
      let acc = Buffer.alloc(0)
      socket.on('data', (chunk: Buffer) => {
        acc = Buffer.concat([acc, chunk])
      })
      socket.once('close', () => resolve(acc))
      socket.write(req)
    })

    expect(raw.toString('latin1')).toContain('426')
  })

  it('broadcasts a single masked binary frame from one client to another, unmasked', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)
    const b = await openClient(port)

    const payload = Buffer.from('hello binary')
    a.socket.write(buildClientFrame(0x2, payload))

    const frame = await b.reader.next()
    expect(frame.opcode).toBe(0x2)
    expect(frame.fin).toBe(true)
    expect(frame.payload.equals(payload)).toBe(true)
  })

  it('reassembles a fragmented message (2+ continuations) and broadcasts it whole', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)
    const b = await openClient(port)

    a.socket.write(buildClientFrame(0x2, Buffer.from('ab'), false))
    a.socket.write(buildClientFrame(0x0, Buffer.from('cd'), false))
    a.socket.write(buildClientFrame(0x0, Buffer.from('ef'), true))

    const frame = await b.reader.next()
    expect(frame.opcode).toBe(0x2)
    expect(frame.fin).toBe(true)
    expect(frame.payload.toString()).toBe('abcdef')
  })

  it('broadcasts a text frame with the text opcode, not hardcoded binary', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)
    const b = await openClient(port)

    const payload = Buffer.from('hello text', 'utf8')
    a.socket.write(buildClientFrame(0x1, payload))

    const frame = await b.reader.next()
    expect(frame.opcode).toBe(0x1)
    expect(frame.payload.toString('utf8')).toBe('hello text')
  })

  it('echoes a ping as a pong with the same payload', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)

    const payload = Buffer.from('ping-data')
    a.socket.write(buildClientFrame(0x9, payload))

    const frame = await a.reader.next()
    expect(frame.opcode).toBe(0xa)
    expect(frame.payload.equals(payload)).toBe(true)
  })

  it('echoes a close frame and ends the connection', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)

    const payload = Buffer.from('bye')
    a.socket.write(buildClientFrame(0x8, payload))

    const frame = await a.reader.next()
    expect(frame.opcode).toBe(0x8)
    expect(frame.payload.equals(payload)).toBe(true)
    await waitClose(a.socket)
  })

  it('destroys the socket when an 8-byte-length frame declares a size over the 16 MB cap', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)

    a.socket.write(buildOversizeHeader(MAX_PAYLOAD + 1024))

    await waitClose(a.socket)
  })

  it('destroys the socket when accumulated fragment size exceeds the 16 MB cap', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)

    // Each fragment individually sits under MAX_PAYLOAD, but the sum
    // (18 MB) does not — the relay must track the running total.
    const first = Buffer.alloc(9 * 1024 * 1024)
    const second = Buffer.alloc(9 * 1024 * 1024)
    a.socket.write(buildClientFrame(0x2, first, false))
    a.socket.write(buildClientFrame(0x0, second, true))

    await waitClose(a.socket)
  }, 20000)

  it('destroys the connection when a client frame arrives unmasked, without broadcasting it', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)
    const b = await openClient(port)

    a.socket.write(buildUnmaskedFrame(0x2, Buffer.from('unmasked')))

    // A's close is the signal that the server has fully processed (and
    // rejected) the unmasked frame — the relay destroys the socket
    // synchronously within the same `data` handler that detects the
    // missing mask bit, before any broadcast could occur.
    await waitClose(a.socket)

    // Prove absence with a signal rather than an elapsed-time no-show: a
    // fresh client sends a known-good frame *after* A's rejection is
    // confirmed. If the relay had incorrectly broadcast A's payload, it
    // would arrive at B first and this equality check would fail
    // deterministically — no timing dependency either way.
    const c = await openClient(port)
    const probe = Buffer.from('probe-after-reject')
    c.socket.write(buildClientFrame(0x2, probe))

    const frame = await b.reader.next()
    expect(frame.payload.equals(probe)).toBe(true)
  })

  it('destroys the connection for a malformed control frame (fragmented or oversized ping)', async () => {
    const { port } = await openRelay()

    // Control frames must not be fragmented (FIN must be 1).
    const a = await openClient(port)
    a.socket.write(buildClientFrame(0x9, Buffer.from('ping'), false))
    await waitClose(a.socket)

    // Control frames are capped at 125 bytes — 200 forces the 2-byte
    // extended-length encoding, which is itself invalid for a control frame.
    const b = await openClient(port)
    b.socket.write(buildClientFrame(0x9, Buffer.alloc(200)))
    await waitClose(b.socket)
  })

  it('destroys the connection when a data frame interrupts an in-progress fragmented message', async () => {
    const { port } = await openRelay()
    const a = await openClient(port)

    a.socket.write(buildClientFrame(0x2, Buffer.from('start'), false)) // fragment start, FIN=0
    a.socket.write(buildClientFrame(0x1, Buffer.from('interrupt'))) // new data frame — protocol error

    await waitClose(a.socket)
  })
})
