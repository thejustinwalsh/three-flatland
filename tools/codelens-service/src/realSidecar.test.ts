/**
 * Proves genuine interop with the real Rust sidecar binary (not the
 * fake-sidecar fixture used by client.test.ts), driven end-to-end through
 * this package's public client API. Skips gracefully — rather than
 * failing — when the binary hasn't been built locally, since this
 * workspace package doesn't own building the Rust crate (see
 * tools/codelens-service/sidecar/, built via `cargo build`) and CI may not
 * always have a Rust toolchain available.
 */

import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CodelensServiceClient } from './client.js'

const BINARY_PATH = fileURLToPath(
  new URL('../sidecar/target/debug/codelens-service', import.meta.url)
)
const BINARY_AVAILABLE = existsSync(BINARY_PATH)

describe.skipIf(!BINARY_AVAILABLE)('CodelensServiceClient against the real sidecar binary', () => {
  let client: CodelensServiceClient | undefined
  let workDir: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'codelens-ts-client-'))
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  it('runs a full initialize -> scan -> parse -> shutdown round trip', async () => {
    client = new CodelensServiceClient({ command: BINARY_PATH })

    const init = await client.initialize({
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage'),
    })
    expect(init.capabilities).toEqual({ scan: true, parse: true, incremental: true })
    expect(init.degraded).toBeUndefined()

    const srcFile = join(workDir, 'sfx.ts')
    const srcText = 'export function boom() {\n  zzfx(...[1,.05,220,0,.02]);\n}\n'
    await writeFile(srcFile, srcText, 'utf8')
    const fileUri = `file://${srcFile}`

    const scan = await client.scan({ candidates: [fileUri] })
    expect(scan.matches).toHaveLength(1)
    expect(scan.matches[0]!.hasCandidate).toBe(true)

    const parsed = await client.parse({ uri: fileUri, text: srcText })
    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0]!.kind).toBe('zzfx.call')
    expect(parsed.findings[0]!.payload.params).toEqual([1, 0.05, 220, 0, 0.02])
    // argRange must cover only the interior of the parens, per the sidecar
    // contract this client was built against (line 1: the "zzfx(...)" call).
    const argRange = parsed.findings[0]!.payload.argRange
    expect(argRange.start.line).toBe(1)

    await client.shutdown()
    expect(client.isExited).toBe(true)
  })

  it('didChange notification is silently accepted by the real sidecar', async () => {
    client = new CodelensServiceClient({ command: BINARY_PATH })
    await client.initialize({ workspaceRoot: workDir, storageUri: join(workDir, 'storage2') })
    client.didChange({ uri: 'file:///virtual/a.ts', text: 'zzfx(1,2,3);' })
    const parsed = await client.parse({ uri: 'file:///virtual/a.ts', text: 'zzfx(1,2,3);' })
    expect(parsed.findings).toHaveLength(1)
    await client.shutdown()
  })

  it('an unknown method against the real sidecar rejects without killing the process', async () => {
    client = new CodelensServiceClient({ command: BINARY_PATH })
    await client.initialize({ workspaceRoot: workDir, storageUri: join(workDir, 'storage3') })
    await expect(client.request('totally/bogus' as never, undefined)).rejects.toMatchObject({
      code: -32601,
    })
    // Process must still be responsive afterward.
    const parsed = await client.parse({ uri: 'file:///a.ts', text: 'zzfx();' })
    expect(parsed.findings).toHaveLength(1)
    await client.shutdown()
  })
})
