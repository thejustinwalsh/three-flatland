import { describe, expect, it, vi } from 'vitest'
import { encodeMessage, MessageDecoder } from './framing.js'

function decodeAll(chunks: Buffer[]): Buffer[] {
  const out: Buffer[] = []
  const decoder = new MessageDecoder((body) => out.push(body))
  for (const chunk of chunks) decoder.push(chunk)
  return out
}

describe('encodeMessage', () => {
  it('prefixes a byte-count Content-Length header', () => {
    const frame = encodeMessage({ hello: true })
    const json = Buffer.from(JSON.stringify({ hello: true }), 'utf8')
    expect(frame.toString('utf8')).toBe(
      `Content-Length: ${json.byteLength}\r\n\r\n${json.toString('utf8')}`
    )
  })

  it('counts UTF-8 bytes, not UTF-16 string length, for multi-byte content', () => {
    // '字' is 1 UTF-16 code unit but 3 UTF-8 bytes — a length-based header
    // would desync the receiver's byte-exact read.
    const frame = encodeMessage({ text: '字'.repeat(10) })
    const headerText = frame.subarray(0, frame.indexOf('\r\n\r\n')).toString('ascii')
    const declaredLength = Number(/Content-Length: (\d+)/.exec(headerText)![1])
    const body = frame.subarray(frame.indexOf('\r\n\r\n') + 4)
    expect(declaredLength).toBe(body.byteLength)
    expect(declaredLength).toBeGreaterThan(JSON.stringify({ text: '字'.repeat(10) }).length)
  })
})

describe('MessageDecoder', () => {
  it('decodes a single message delivered in one chunk', () => {
    const frame = encodeMessage({ a: 1 })
    const [body] = decodeAll([frame])
    expect(JSON.parse(body!.toString('utf8'))).toEqual({ a: 1 })
  })

  it('decodes multiple messages concatenated in a single chunk', () => {
    const frame = Buffer.concat([encodeMessage({ a: 1 }), encodeMessage({ b: 2 })])
    const bodies = decodeAll([frame]).map((b) => JSON.parse(b.toString('utf8')))
    expect(bodies).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('decodes a message split across many chunks, including byte-by-byte', () => {
    const frame = encodeMessage({ hello: 'world', n: 42 })
    const chunks = Array.from(frame).map((byte) => Buffer.from([byte]))
    const bodies = decodeAll(chunks).map((b) => JSON.parse(b.toString('utf8')))
    expect(bodies).toEqual([{ hello: 'world', n: 42 }])
  })

  it('decodes a message whose header and body straddle a chunk boundary mid-header', () => {
    const frame = encodeMessage({ x: 1 })
    const splitPoint = frame.indexOf('\r\n\r\n') - 2 // cut inside "Content-Length: N"
    const bodies = decodeAll([frame.subarray(0, splitPoint), frame.subarray(splitPoint)]).map((b) =>
      JSON.parse(b.toString('utf8'))
    )
    expect(bodies).toEqual([{ x: 1 }])
  })

  it('decodes a message whose body straddles a chunk boundary', () => {
    const frame = encodeMessage({ payload: 'x'.repeat(500) })
    const headerEnd = frame.indexOf('\r\n\r\n') + 4
    const splitPoint = headerEnd + 100
    const bodies = decodeAll([frame.subarray(0, splitPoint), frame.subarray(splitPoint)]).map((b) =>
      JSON.parse(b.toString('utf8'))
    )
    expect(bodies).toEqual([{ payload: 'x'.repeat(500) }])
  })

  it('correctly splits multi-byte UTF-8 content even when a chunk boundary falls inside a character', () => {
    const frame = encodeMessage({ text: '字'.repeat(50) })
    const headerEnd = frame.indexOf('\r\n\r\n') + 4
    // Split one byte into the 3-byte UTF-8 encoding of '字' — the decoder
    // must still reassemble the exact original bytes before decoding UTF-8.
    const splitPoint = headerEnd + 7
    const bodies = decodeAll([frame.subarray(0, splitPoint), frame.subarray(splitPoint)]).map((b) =>
      JSON.parse(b.toString('utf8'))
    )
    expect(bodies).toEqual([{ text: '字'.repeat(50) }])
  })

  it('ignores unrelated headers preceding Content-Length', () => {
    const json = Buffer.from(JSON.stringify({ ok: true }), 'utf8')
    const raw = Buffer.concat([
      Buffer.from(
        `Content-Type: application/json\r\nContent-Length: ${json.byteLength}\r\n\r\n`,
        'ascii'
      ),
      json,
    ])
    const [body] = decodeAll([raw])
    expect(JSON.parse(body!.toString('utf8'))).toEqual({ ok: true })
  })

  it('matches the Content-Length header name case-insensitively', () => {
    const json = Buffer.from(JSON.stringify({ ok: true }), 'utf8')
    const raw = Buffer.concat([
      Buffer.from(`content-length: ${json.byteLength}\r\n\r\n`, 'ascii'),
      json,
    ])
    const [body] = decodeAll([raw])
    expect(JSON.parse(body!.toString('utf8'))).toEqual({ ok: true })
  })

  it('throws (does not silently hang) when Content-Length is missing', () => {
    const raw = Buffer.from('Content-Type: application/json\r\n\r\ntest', 'ascii')
    const onMessage = vi.fn()
    const decoder = new MessageDecoder(onMessage)
    expect(() => decoder.push(raw)).toThrow(/Content-Length/)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('waits for more data rather than emitting a partial message', () => {
    const frame = encodeMessage({ a: 1 })
    const onMessage = vi.fn()
    const decoder = new MessageDecoder(onMessage)
    decoder.push(frame.subarray(0, frame.byteLength - 1))
    expect(onMessage).not.toHaveBeenCalled()
    decoder.push(frame.subarray(frame.byteLength - 1))
    expect(onMessage).toHaveBeenCalledTimes(1)
  })
})
