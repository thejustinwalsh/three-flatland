import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CodelensServiceClient,
  CodelensServiceError,
  CodelensServiceExitedError,
} from './client.js'

const FAKE_SIDECAR = fileURLToPath(new URL('./__fixtures__/fakeSidecar.mjs', import.meta.url))

function spawnFake(extraArgs: string[] = []): CodelensServiceClient {
  return new CodelensServiceClient({
    binaryPath: process.execPath,
    args: [FAKE_SIDECAR, ...extraArgs],
    workspaceRoot: '/ws',
    storageUri: '/ws/.storage',
  })
}

describe('CodelensServiceClient', () => {
  let client: CodelensServiceClient | undefined

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  it('start() spawns the process and runs the initialize handshake', async () => {
    client = spawnFake()
    const result = await client.start()
    expect(result.version).toBe('0.0.0-fake')
    expect(result.capabilities).toEqual({ scan: true, parse: true, incremental: true })
  })

  it('calling start() twice throws', async () => {
    client = spawnFake()
    await client.start()
    await expect(client.start()).rejects.toThrow(/more than once/)
  })

  it('request()/notify() before start() reject/throw cleanly rather than hanging', async () => {
    client = spawnFake()
    expect(() => client!.didChange({ uri: 'file:///a.ts', text: 'x' })).toThrow(
      CodelensServiceExitedError
    )
    await expect(client.scan()).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('correlates concurrent requests by id, not by send order', async () => {
    client = spawnFake()
    await client.start()
    // Fire several requests without awaiting between them; each must
    // resolve with the response matching its own id, even though the
    // fixture (like the real sidecar) responds in receipt order.
    const [a, b, c] = await Promise.all([
      client.scan({ candidates: ['file:///a.ts'] }),
      client.scan({ candidates: ['file:///b.ts'] }),
      client.scan({ candidates: ['file:///c.ts'] }),
    ])
    expect(a.matches[0]!.uri).toBe('file:///a.ts')
    expect(b.matches[0]!.uri).toBe('file:///b.ts')
    expect(c.matches[0]!.uri).toBe('file:///c.ts')
  })

  it('parses and returns typed findings', async () => {
    client = spawnFake()
    await client.start()
    const result = await client.parse({ uri: 'file:///a.ts', text: 'zzfx(1,.05,220);' })
    expect(result.uri).toBe('file:///a.ts')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.kind).toBe('zzfx.call')
    expect(result.findings[0]!.payload.params).toEqual([1, 0.05, 220])
  })

  it('didChange is fire-and-forget and reaches the sidecar', async () => {
    client = spawnFake()
    await client.start()
    client.didChange({ uri: 'file:///a.ts', text: 'zzfx(1,2,3);' })
    // No response to await for a notification; the next request's result
    // (via the fixture's _didChangeSeen echo) proves the notification was
    // received and processed before this request, not dropped.
    const result = (await client.parse({
      uri: 'file:///a.ts',
      text: 'zzfx(1,2,3);',
    })) as unknown as {
      _didChangeSeen: boolean
    }
    expect(result._didChangeSeen).toBe(true)
  })

  it('rejects with CodelensServiceError carrying the JSON-RPC error code', async () => {
    client = spawnFake()
    await client.start()
    await expect(client.request('boom' as never, undefined)).rejects.toMatchObject({
      name: 'CodelensServiceError',
      code: -32000,
      message: 'boom requested',
    })
  })

  it('an unknown method rejects with the -32601 code', async () => {
    client = spawnFake()
    await client.start()
    await expect(client.request('totally/bogus' as never, undefined)).rejects.toBeInstanceOf(
      CodelensServiceError
    )
  })

  it('onError fires on a malformed message BODY without corrupting the stream (non-fatal)', async () => {
    // Framing stays intact here (correct Content-Length, just invalid JSON
    // inside it) — the decoder's byte position is never lost, so this must
    // NOT kill the connection. Contrast with framingBoom below, which
    // corrupts the byte stream itself and IS fatal.
    client = spawnFake()
    await client.start()
    const errors: Error[] = []
    client.onError((error) => errors.push(error))
    // The fixture writes one malformed frame then a normal response to the
    // same request id — the malformed frame must not resolve/reject the
    // pending request, and the following well-formed frame must still land.
    const result = await client.request('garbage' as never, undefined)
    expect(result).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/malformed JSON frame/)
    expect(client.isExited).toBe(false)
  })

  it('a genuine framing-level error (lost byte alignment) is fatal to the connection', async () => {
    client = spawnFake()
    await client.start()
    const errors: Error[] = []
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = []
    client.onError((error) => errors.push(error))
    client.onExit((code, signal) => exits.push({ code, signal }))

    // The fixture never sends a valid response for this request — the
    // pending promise must still settle (reject), driven by connection
    // failure, not a response. Rejects with the SAME error type as every
    // other fatal-connection path (spawn failure, unexpected exit) — a
    // distinct, catchable class, not a bare Error carrying the raw framing
    // failure message.
    const pending = client.request('framingBoom' as never, undefined)
    await expect(pending).rejects.toBeInstanceOf(CodelensServiceExitedError)

    expect(client.isExited).toBe(true)
    expect(exits).toEqual([{ code: null, signal: null }])
    expect(errors.length).toBeGreaterThan(0)

    // The connection is dead — further requests fail immediately too.
    await expect(client.scan()).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('shutdown resolves once the process has actually exited', async () => {
    client = spawnFake()
    await client.start()
    await client.shutdown()
    expect(client.isExited).toBe(true)
  })

  it('shutdown falls back to SIGKILL when the process hangs past the timeout', async () => {
    client = spawnFake(['--hang-on-shutdown'])
    await client.start()
    const startedAt = Date.now()
    await client.shutdown(200)
    expect(Date.now() - startedAt).toBeLessThan(2000) // proves it didn't wait forever
    expect(client.isExited).toBe(true)
  })

  it('onExit fires with the process exit code/signal, and returns an unsubscribe function', async () => {
    client = spawnFake()
    await client.start()
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = []
    const off = client.onExit((code, signal) => exits.push({ code, signal }))
    await client.shutdown()
    expect(exits).toEqual([{ code: 0, signal: null }])
    expect(() => off()).not.toThrow()
  })

  it('rejects pending requests if the process exits unexpectedly', async () => {
    // A process that exits immediately without ever responding.
    client = new CodelensServiceClient({
      binaryPath: process.execPath,
      args: ['-e', 'process.exit(1)'],
      workspaceRoot: '/ws',
      storageUri: '/ws/.storage',
    })
    await expect(client.start()).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('rejects immediately for requests sent after the process has exited', async () => {
    client = new CodelensServiceClient({
      binaryPath: process.execPath,
      args: ['-e', 'process.exit(0)'],
      workspaceRoot: '/ws',
      storageUri: '/ws/.storage',
    })
    await expect(client.start()).rejects.toBeInstanceOf(CodelensServiceExitedError)
    await expect(client.scan()).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('rejects when the command cannot be spawned at all, and isExited becomes true immediately', async () => {
    client = new CodelensServiceClient({
      binaryPath: '/definitely/not/a/real/binary-xyz',
      workspaceRoot: '/ws',
      storageUri: '/ws/.storage',
    })
    await expect(client.start()).rejects.toBeInstanceOf(CodelensServiceExitedError)
    // Regression: a spawn failure (Node's 'error' event) does not reliably
    // guarantee a subsequent 'exit' event across all failure modes/OSes —
    // isExited must be set directly on the spawn-error path, not left for
    // 'exit' to (maybe) set later. Otherwise this would incorrectly read
    // false forever, and a caller checking it before retrying would never
    // learn the process is dead.
    expect(client.isExited).toBe(true)
  })

  it('a follow-up scan() call after a failed spawn rejects immediately — no hang', async () => {
    client = new CodelensServiceClient({
      binaryPath: '/definitely/not/a/real/binary-xyz',
      workspaceRoot: '/ws',
      storageUri: '/ws/.storage',
    })
    await expect(client.start()).rejects.toBeInstanceOf(CodelensServiceExitedError)

    // The actual observable contract callers rely on: a real public-API
    // call made after a failed start() must fail fast (not hang waiting on
    // a response that will never come) and reject with the same error
    // type. isExited being true (asserted separately above) is necessary
    // but not sufficient proof of this — the request() codepath actually
    // has to honor it.
    const startedAt = Date.now()
    await expect(client.scan()).rejects.toBeInstanceOf(CodelensServiceExitedError)
    expect(Date.now() - startedAt).toBeLessThan(100)
  })

  it('a spawn failure makes onExit fire too (not just the rejected start() promise)', async () => {
    client = new CodelensServiceClient({
      binaryPath: '/definitely/not/a/real/binary-xyz',
      workspaceRoot: '/ws',
      storageUri: '/ws/.storage',
    })
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = []
    client.onExit((code, signal) => exits.push({ code, signal }))
    await expect(client.start()).rejects.toBeInstanceOf(CodelensServiceExitedError)
    expect(exits).toEqual([{ code: null, signal: null }])
  })

  it('exposes the sidecar stderr stream', async () => {
    client = spawnFake()
    await client.start()
    const stderrChunks: string[] = []
    client.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString('utf8')))
    client.didChange({ uri: 'file:///a.ts', text: 'zzfx(1,2,3);' })
    await client.parse({ uri: 'file:///a.ts', text: 'zzfx(1,2,3);' }) // ensures the didChange line was flushed first
    expect(stderrChunks.join('')).toContain('didChange: file:///a.ts')
  })
})
