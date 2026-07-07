/**
 * LSP-style `Content-Length: N\r\n\r\n{json}` framing, matching
 * `tools/codelens-service/sidecar/src/framing.rs` byte-for-byte: N counts
 * UTF-8 bytes of the body, not JS string `.length` (UTF-16 code units) —
 * multi-byte characters in a message would otherwise desync the stream.
 */

/** Encodes `body` (any JSON-serializable value) as one framed message. */
export function encodeMessage(body: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(body), 'utf8')
  const header = Buffer.from(`Content-Length: ${json.byteLength}\r\n\r\n`, 'ascii')
  return Buffer.concat([header, json])
}

const HEADER_TERMINATOR = Buffer.from('\r\n\r\n', 'ascii')

/**
 * Incrementally decodes a byte stream into complete message bodies. Feed it
 * chunks as they arrive from a child process's stdout via {@link push} — it
 * buffers partial headers/bodies across chunk boundaries and invokes
 * `onMessage` once per complete frame, in arrival order.
 */
export class MessageDecoder {
  private buffer = Buffer.alloc(0)

  constructor(private readonly onMessage: (body: Buffer) => void) {}

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const headerEnd = this.buffer.indexOf(HEADER_TERMINATOR)
      if (headerEnd === -1) return

      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const contentLength = parseContentLength(header)
      if (contentLength === null) {
        throw new Error(
          `codelens-service: missing Content-Length header in: ${JSON.stringify(header)}`
        )
      }

      const bodyStart = headerEnd + HEADER_TERMINATOR.byteLength
      const bodyEnd = bodyStart + contentLength
      if (this.buffer.byteLength < bodyEnd) return // wait for more data

      const body = this.buffer.subarray(bodyStart, bodyEnd)
      this.buffer = this.buffer.subarray(bodyEnd)
      this.onMessage(Buffer.from(body))
    }
  }
}

function parseContentLength(header: string): number | null {
  for (const line of header.split('\r\n')) {
    const [name, ...rest] = line.split(':')
    if (name === undefined) continue
    if (name.trim().toLowerCase() === 'content-length') {
      const value = Number.parseInt(rest.join(':').trim(), 10)
      return Number.isNaN(value) ? null : value
    }
  }
  return null
}
