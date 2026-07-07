#!/usr/bin/env node
/**
 * flatland-devtools-relay — minimal WebSocket relay for remote/mobile
 * debugging (#114). Every frame received from one client is forwarded
 * to every other client; the provider bridge and the dashboard bridge
 * sort out semantics via the bus-frame direction sets.
 *
 *   npx flatland-devtools-relay [--port 8123] [--host 0.0.0.0]
 *
 * Zero dependencies: a hand-rolled RFC 6455 server covering exactly
 * what the bridges use — frames ≤ 16 MB (single frame or reassembled
 * fragments), client-masked input, no extensions, no fragmentation of
 * outgoing messages. Development tool only: no auth, no TLS — run it
 * on a trusted network. The default host (0.0.0.0) exposes the relay
 * to your local network so a phone or another machine can reach it;
 * pass `--host 127.0.0.1` to bind loopback-only.
 */
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import type { Duplex } from 'node:stream'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_PAYLOAD = 16 * 1024 * 1024

interface Client {
  socket: Duplex
  buffer: Buffer
  /** In-flight fragmented message: first-frame opcode + accumulated payload. */
  fragmentOpcode: number
  fragments: Buffer[]
  /** Running total of `fragments` payload bytes — bounds reassembly to MAX_PAYLOAD. */
  fragmentSize: number
}

export interface RelayHandle {
  /** Stop the relay: destroys all client sockets and closes the server. */
  close: () => void
  /**
   * The underlying HTTP server — use `.address()` to read the bound
   * port when `port` was passed as 0 (ephemeral; tests only, the CLI
   * always passes an explicit port).
   */
  server: Server
}

export function startRelay(port: number, host: string): RelayHandle {
  const clients = new Set<Client>()

  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('flatland-devtools-relay\n')
  })

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    if (req.headers['sec-websocket-version'] !== '13') {
      socket.write('HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\n\r\n')
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )

    const client: Client = {
      socket,
      buffer: Buffer.alloc(0),
      fragmentOpcode: 0,
      fragments: [],
      fragmentSize: 0,
    }
    clients.add(client)

    const broadcast = (payload: Buffer, opcode: number): void => {
      const out = buildFrame(opcode, payload)
      for (const other of clients) {
        if (other !== client && other.socket.writable) {
          try {
            other.socket.write(out)
          } catch {
            // Peer closed mid-write — drop the frame, its own close/error
            // handler will evict it from `clients`.
          }
        }
      }
    }

    socket.on('data', (chunk: Buffer) => {
      client.buffer = Buffer.concat([client.buffer, chunk])
      let frame = readFrame(client)
      while (frame !== null) {
        if (frame.opcode === 0x8) {
          // close — echo the close frame per RFC 6455 §5.5.1, then end.
          socket.write(buildFrame(0x8, frame.payload))
          socket.end()
          break
        } else if (frame.opcode === 0x9) {
          // ping → pong (control frames may interleave with fragments)
          socket.write(buildFrame(0xa, frame.payload))
        } else if (frame.opcode === 0xa) {
          // pong — ignore
        } else if (frame.opcode === 0x2 || frame.opcode === 0x1) {
          if (frame.fin) {
            broadcast(frame.payload, frame.opcode)
          } else {
            // Start of a fragmented message.
            client.fragmentOpcode = frame.opcode
            client.fragments = [frame.payload]
            client.fragmentSize = frame.payload.length
          }
        } else if (frame.opcode === 0x0) {
          // Continuation of a fragmented message.
          if (client.fragments.length === 0) {
            socket.destroy() // continuation with no start — protocol error
            break
          }
          // Each frame is already capped at MAX_PAYLOAD by readFrame, but
          // an attacker can drip-feed unbounded small continuations —
          // bound the reassembled total too.
          if (client.fragmentSize + frame.payload.length > MAX_PAYLOAD) {
            socket.destroy()
            break
          }
          client.fragments.push(frame.payload)
          client.fragmentSize += frame.payload.length
          if (frame.fin) {
            broadcast(Buffer.concat(client.fragments), client.fragmentOpcode)
            client.fragments = []
            client.fragmentSize = 0
            client.fragmentOpcode = 0
          }
        }
        frame = readFrame(client)
      }
    })

    const drop = (): void => {
      clients.delete(client)
      socket.destroy()
    }
    socket.on('close', drop)
    socket.on('error', drop)
  })

  server.listen(port, host, () => {
    console.log(`flatland-devtools-relay listening on ws://${host}:${port}`)
    if (host === '0.0.0.0') {
      console.log(
        '  warning: exposed to your local network; pass --host 127.0.0.1 for local-only'
      )
    }
    console.log('  game:      createDevtoolsProvider({ remote: "ws://<this-host>:%d" })', port)
    console.log('  dashboard: connectRemoteDevtools("ws://<this-host>:%d")', port)
  })

  return {
    close: () => {
      for (const client of clients) client.socket.destroy()
      clients.clear()
      server.close()
    },
    server,
  }
}

interface WsFrame {
  opcode: number
  fin: boolean
  payload: Buffer
}

function readFrame(client: Client): WsFrame | null {
  const buf = client.buffer
  if (buf.length < 2) return null
  const fin = (buf[0]! & 0x80) !== 0
  const opcode = buf[0]! & 0x0f
  const masked = (buf[1]! & 0x80) !== 0
  let payloadLength = buf[1]! & 0x7f
  let offset = 2
  if (payloadLength === 126) {
    if (buf.length < 4) return null
    payloadLength = buf.readUInt16BE(2)
    offset = 4
  } else if (payloadLength === 127) {
    if (buf.length < 10) return null
    const big = buf.readBigUInt64BE(2)
    if (big > BigInt(MAX_PAYLOAD)) {
      client.socket.destroy()
      return null
    }
    payloadLength = Number(big)
    offset = 10
  }
  const maskLength = masked ? 4 : 0
  if (buf.length < offset + maskLength + payloadLength) return null

  let payload = buf.subarray(offset + maskLength, offset + maskLength + payloadLength)
  if (masked) {
    const mask = buf.subarray(offset, offset + 4)
    const unmasked = Buffer.allocUnsafe(payloadLength)
    for (let i = 0; i < payloadLength; i++) {
      unmasked[i] = payload[i]! ^ mask[i % 4]!
    }
    payload = unmasked
  } else {
    payload = Buffer.from(payload) // copy out of the rolling buffer
  }

  client.buffer = buf.subarray(offset + maskLength + payloadLength)
  return { opcode, fin, payload }
}

function buildFrame(opcode: number, payload: Buffer): Buffer {
  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length])
  } else if (payload.length < 0x10000) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  return Buffer.concat([header, payload])
}

// Invoked as a bin
const isMain = process.argv[1]?.endsWith('relay.js') || process.argv[1]?.endsWith('relay.ts')
if (isMain) {
  const args = process.argv.slice(2)
  let port = 8123
  let host = '0.0.0.0'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i])
    else if (args[i] === '--host') host = String(args[++i])
  }
  startRelay(port, host)
}
