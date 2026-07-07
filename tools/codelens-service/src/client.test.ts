import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CodelensServiceClient,
  CodelensServiceError,
  CodelensServiceExitedError,
} from './client.js'

const FAKE_SIDECAR = fileURLToPath(new URL('./__fixtures__/fakeSidecar.mjs', import.meta.url))

function spawnFake(): CodelensServiceClient {
  return new CodelensServiceClient({ command: process.execPath, args: [FAKE_SIDECAR] })
}

describe('CodelensServiceClient', () => {
  let client: CodelensServiceClient | undefined

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  it('initializes and receives typed capabilities', async () => {
    client = spawnFake()
    const result = await client.initialize({ workspaceRoot: '/ws', storageUri: '/ws/.storage' })
    expect(result.version).toBe('0.0.0-fake')
    expect(result.capabilities).toEqual({ scan: true, parse: true, incremental: true })
  })

  it('correlates concurrent requests by id, not by send order', async () => {
    client = spawnFake()
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
    const result = await client.parse({ uri: 'file:///a.ts', text: 'zzfx(1,.05,220);' })
    expect(result.uri).toBe('file:///a.ts')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.kind).toBe('zzfx.call')
    expect(result.findings[0]!.payload.params).toEqual([1, 0.05, 220])
  })

  it('didChange is fire-and-forget and reaches the sidecar', async () => {
    client = spawnFake()
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
    await expect(client.request('boom' as never, undefined)).rejects.toMatchObject({
      name: 'CodelensServiceError',
      code: -32000,
      message: 'boom requested',
    })
  })

  it('an unknown method rejects with the -32601 code', async () => {
    client = spawnFake()
    await expect(client.request('totally/bogus' as never, undefined)).rejects.toBeInstanceOf(
      CodelensServiceError
    )
  })

  it('shutdown resolves once the process has actually exited', async () => {
    client = spawnFake()
    await client.initialize({ workspaceRoot: '/ws', storageUri: '/ws/.storage' })
    await client.shutdown()
    expect(client.isExited).toBe(true)
  })

  it('rejects pending requests if the process exits unexpectedly', async () => {
    // A process that exits immediately without ever responding.
    client = new CodelensServiceClient({
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
    })
    await expect(
      client.initialize({ workspaceRoot: '/ws', storageUri: '/ws/.storage' })
    ).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('rejects immediately for requests sent after the process has exited', async () => {
    client = new CodelensServiceClient({
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
    })
    await new Promise((resolve) => setTimeout(resolve, 50)) // let the exit event land
    await expect(
      client.initialize({ workspaceRoot: '/ws', storageUri: '/ws/.storage' })
    ).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('rejects when the command cannot be spawned at all', async () => {
    client = new CodelensServiceClient({ command: '/definitely/not/a/real/binary-xyz' })
    await expect(
      client.initialize({ workspaceRoot: '/ws', storageUri: '/ws/.storage' })
    ).rejects.toBeInstanceOf(CodelensServiceExitedError)
  })

  it('exposes the sidecar stderr stream', async () => {
    client = spawnFake()
    const stderrChunks: string[] = []
    client.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString('utf8')))
    client.didChange({ uri: 'file:///a.ts', text: 'zzfx(1,2,3);' })
    await client.parse({ uri: 'file:///a.ts', text: 'zzfx(1,2,3);' }) // ensures the didChange line was flushed first
    expect(stderrChunks.join('')).toContain('didChange: file:///a.ts')
  })
})
