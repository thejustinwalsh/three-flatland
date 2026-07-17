/**
 * LSP-style `Content-Length: N\r\n\r\n{json}` framing, matching
 * `tools/codelens-service/sidecar/src/framing.rs` byte-for-byte: N counts
 * UTF-8 bytes of the body, not JS string `.length` (UTF-16 code units) —
 * multi-byte characters in a message would otherwise desync the stream.
 *
 * Header parsing is strict, mirroring the Rust side: a header that can't be
 * trusted unambiguously (duplicated, non-numeric, or an implausibly large
 * declared length) is a framing error. Once that happens, byte alignment
 * with the rest of the stream is lost — {@link MessageDecoder} poisons
 * itself (see below) rather than silently limping along.
 */

/** Encodes `body` (any JSON-serializable value) as one framed message. */
export function encodeMessage(body: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(body), 'utf8')
  const header = Buffer.from(`Content-Length: ${json.byteLength}\r\n\r\n`, 'ascii')
  return Buffer.concat([header, json])
}

const HEADER_TERMINATOR = Buffer.from('\r\n\r\n', 'ascii')

/**
 * Upper bound on a single message body, matching
 * `sidecar/src/framing.rs::MAX_MESSAGE_BYTES` — kept equal so a message
 * that's valid on one side of the pipe is valid on the other.
 */
export const MAX_MESSAGE_BYTES = 64 * 1024 * 1024

/**
 * Incrementally decodes a byte stream into complete message bodies. Feed it
 * chunks as they arrive from a child process's stdout via {@link push} — it
 * buffers partial headers/bodies across chunk boundaries and invokes
 * `onMessage` once per complete frame, in arrival order.
 *
 * A framing error is fatal to the decoder: once `push` throws, the decoder
 * is poisoned and every subsequent `push` call throws immediately without
 * touching the buffer. There is no way to safely resynchronize with a
 * stream whose frame boundaries can no longer be trusted, so this must not
 * silently keep re-processing (and re-throwing on) the same bad bytes
 * forever — callers should treat a thrown error from `push` as fatal to
 * the whole connection, not just a dropped message.
 */
export class MessageDecoder {
  private buffer = Buffer.alloc(0)
  private poisoned = false

  constructor(private readonly onMessage: (body: Buffer) => void) {}

  push(chunk: Buffer): void {
    if (this.poisoned) {
      throw new Error(
        'codelens-service: MessageDecoder is poisoned from a prior framing error and cannot process more data'
      )
    }
    this.buffer = Buffer.concat([this.buffer, chunk])
    try {
      this.drain()
    } catch (error) {
      this.poisoned = true
      throw error
    }
  }

  private drain(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf(HEADER_TERMINATOR)
      if (headerEnd === -1) return

      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const result = parseContentLength(header)
      if (result.kind === 'missing') {
        throw new Error(`codelens-service: missing Content-Length header in: ${JSON.stringify(header)}`)
      }
      if (result.kind === 'invalid') {
        throw new Error(`codelens-service: ${result.reason}`)
      }

      const bodyStart = headerEnd + HEADER_TERMINATOR.byteLength
      const bodyEnd = bodyStart + result.value
      if (this.buffer.byteLength < bodyEnd) return // wait for more data

      const body = this.buffer.subarray(bodyStart, bodyEnd)
      this.buffer = this.buffer.subarray(bodyEnd)
      this.onMessage(Buffer.from(body))
    }
  }
}

type ContentLengthResult = { kind: 'missing' } | { kind: 'invalid'; reason: string } | { kind: 'ok'; value: number }

const STRICT_DIGITS = /^\d+$/

function parseContentLength(header: string): ContentLengthResult {
  let found: number | undefined
  for (const line of header.split('\r\n')) {
    const [name, ...rest] = line.split(':')
    if (name === undefined || name.trim().toLowerCase() !== 'content-length') continue

    if (found !== undefined) {
      // A smuggling-style ambiguity: which one is authoritative? Neither —
      // reject rather than silently pick a winner (and, just as important,
      // don't disagree with which one the Rust side would pick either).
      return { kind: 'invalid', reason: 'duplicate Content-Length header' }
    }

    const raw = rest.join(':').trim()
    // Strict all-digits check first: Number.parseInt alone is lenient and
    // would silently accept "10abc" as 10, stopping at the first non-digit.
    if (!STRICT_DIGITS.test(raw)) {
      return { kind: 'invalid', reason: `invalid Content-Length: ${JSON.stringify(raw)}` }
    }
    const value = Number.parseInt(raw, 10)
    if (value > MAX_MESSAGE_BYTES) {
      return {
        kind: 'invalid',
        reason: `Content-Length ${value} exceeds the ${MAX_MESSAGE_BYTES}-byte limit`,
      }
    }
    found = value
  }
  return found === undefined ? { kind: 'missing' } : { kind: 'ok', value: found }
}
