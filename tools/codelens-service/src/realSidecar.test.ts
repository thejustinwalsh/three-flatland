/**
 * Proves genuine interop with the real Rust sidecar binary (not the
 * fake-sidecar fixture used by client.test.ts), driven end-to-end through
 * this package's public client API. Actively `cargo build`s the sidecar as
 * a test-setup step rather than hoping a prior build is lying around, so
 * these tests are actually exercised whenever a Rust toolchain is present.
 * If `cargo` isn't on PATH at all, this loudly warns and skips — this
 * workspace package doesn't own the Rust crate's toolchain requirement, and
 * CI may not always have one available.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CodelensServiceClient } from './client.js'
import type { Range } from './protocol.js'
import { resolveBinary } from './resolveBinary.js'

/**
 * Slices `text` at an LSP `Range` (0-based line, UTF-16-code-unit
 * character) — JS strings are natively UTF-16-code-unit indexed, so this
 * needs no encoding conversion, just line splitting. Used to prove a
 * defRange's semantics directly against the source it was computed from,
 * rather than trusting position numbers in isolation.
 */
function sliceRange(text: string, range: Range): string {
  const lines = text.split('\n')
  if (range.start.line === range.end.line) {
    return lines[range.start.line]!.slice(range.start.character, range.end.character)
  }
  const startLine = lines[range.start.line]!.slice(range.start.character)
  const middleLines = lines.slice(range.start.line + 1, range.end.line)
  const endLine = lines[range.end.line]!.slice(0, range.end.character)
  return [startLine, ...middleLines, endLine].join('\n')
}

const SIDECAR_DIR = fileURLToPath(new URL('../sidecar', import.meta.url))
const CARGO_AVAILABLE = spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0

if (!CARGO_AVAILABLE) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[codelens-service] cargo not found on PATH — skipping real-sidecar integration tests ' +
      '(src/realSidecar.test.ts). Install the Rust toolchain and re-run to exercise these.\n'
  )
}

describe.skipIf(!CARGO_AVAILABLE)('CodelensServiceClient against the real sidecar binary', () => {
  let binaryPath: string
  let workDir: string

  beforeAll(async () => {
    execFileSync('cargo', ['build'], { cwd: SIDECAR_DIR, stdio: 'inherit' })
    binaryPath = resolveBinary({
      candidates: [join(SIDECAR_DIR, 'target', 'debug', 'codelens-service')],
      includeDevFallback: false,
    })
    workDir = await mkdtemp(join(tmpdir(), 'codelens-ts-client-'))
  }, 120_000)

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  let client: CodelensServiceClient | undefined

  it('runs a full start(initialize) -> scan -> parse -> shutdown round trip', async () => {
    client = new CodelensServiceClient({
      binaryPath,
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage'),
    })

    const init = await client.start()
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

  it('didChange triggers a real reparse the sidecar serves back on the next parse', async () => {
    client = new CodelensServiceClient({
      binaryPath,
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage2'),
    })
    await client.start()

    const uri = 'file:///virtual/a.ts'
    const original = await client.parse({ uri, text: 'zzfx(1,2,3);' })
    expect(original.findings).toHaveLength(1)
    expect(original.findings[0]!.payload.params).toEqual([1, 2, 3])

    // Notify a content change, then re-parse with the NEW text — the
    // sidecar must reflect the updated call, not silently serve a cached
    // result keyed to the old content.
    client.didChange({ uri, text: 'zzfx(4,5,6);zzfx(7,8,9);' })
    const reparsed = await client.parse({ uri, text: 'zzfx(4,5,6);zzfx(7,8,9);' })
    expect(reparsed.findings).toHaveLength(2)
    expect(reparsed.findings[0]!.payload.params).toEqual([4, 5, 6])
    expect(reparsed.findings[1]!.payload.params).toEqual([7, 8, 9])

    await client.shutdown()
  })

  it('an unknown method against the real sidecar rejects without killing the process', async () => {
    client = new CodelensServiceClient({
      binaryPath,
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage3'),
    })
    await client.start()
    await expect(client.request('totally/bogus' as never, undefined)).rejects.toMatchObject({
      code: -32601,
    })
    // Process must still be responsive afterward — zzfx() with zero args is
    // still one finding (empty params), per the sidecar's own contract.
    const parsed = await client.parse({ uri: 'file:///a.ts', text: 'zzfx();' })
    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0]!.payload.params).toEqual([])
    await client.shutdown()
  })

  it("a type-annotated variable's defRange slices out exactly the initializer, nothing else", async () => {
    // The one assertion that can never lie about semantics: rather than
    // trusting line/character numbers in isolation, slice the ORIGINAL
    // source text at defRange and check it's byte-for-byte the array
    // literal — not "LASER: number[] = [...]" (the whole declarator, the
    // bug this test guards against — a write-back replacing that range
    // would delete the variable's name and type), not the initializer
    // plus a trailing `;`, just the value.
    client = new CodelensServiceClient({
      binaryPath,
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage4'),
    })
    await client.start()

    const uri = 'file:///virtual/typed.ts'
    const text = 'const LASER: number[] = [0.6, 0, 100, 0.02, 0.15];\nzzfx(...LASER);\n'
    const parsed = await client.parse({ uri, text })
    expect(parsed.findings).toHaveLength(1)

    const varRef = parsed.findings[0]!.payload.varRef
    expect(varRef?.name).toBe('LASER')
    expect(varRef?.defRange).toBeDefined()
    expect(sliceRange(text, varRef!.defRange!)).toBe('[0.6, 0, 100, 0.02, 0.15]')

    await client.shutdown()
  })
})
