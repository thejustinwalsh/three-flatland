/**
 * Golden interop fixture: `../fixtures/golden/golden.ts` and
 * `../fixtures/golden/golden.findings.json` are the same two files the
 * Rust sidecar's `sidecar/tests/golden.rs` loads. Both sides assert their
 * `document/parse` output against the identical expected JSON — this is
 * the one test that actually catches a Rust/TypeScript protocol drift,
 * rather than each side merely being internally self-consistent (the
 * fake-sidecar fixture used by client.test.ts hand-copies the same shapes
 * this client expects, so it can't notice a real mismatch against what the
 * Rust side actually produces).
 *
 * See the header comment in `golden.ts` and
 * `tools/codelens-service/CLAUDE.md` for how to regenerate the golden JSON
 * if the fixture or the extraction logic changes.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CodelensServiceClient } from './client.js'
import type { Finding } from './protocol.js'
import { resolveBinary } from './resolveBinary.js'

const SIDECAR_DIR = fileURLToPath(new URL('../sidecar', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/golden', import.meta.url))
const GOLDEN_URI = 'file:///golden.ts'
const CARGO_AVAILABLE = spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0

if (!CARGO_AVAILABLE) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[codelens-service] cargo not found on PATH — skipping the golden interop fixture test ' +
      '(src/goldenFixture.test.ts). Install the Rust toolchain and re-run to exercise it.\n'
  )
}

describe.skipIf(!CARGO_AVAILABLE)('golden interop fixture', () => {
  let binaryPath: string
  let goldenText: string
  let goldenFindings: Finding[]
  let workDir: string
  let client: CodelensServiceClient | undefined

  beforeAll(async () => {
    execFileSync('cargo', ['build'], { cwd: SIDECAR_DIR, stdio: 'inherit' })
    binaryPath = resolveBinary({
      candidates: [join(SIDECAR_DIR, 'target', 'debug', 'codelens-service')],
      includeDevFallback: false,
    })
    goldenText = await readFile(join(FIXTURES_DIR, 'golden.ts'), 'utf8')
    goldenFindings = JSON.parse(
      await readFile(join(FIXTURES_DIR, 'golden.findings.json'), 'utf8')
    ) as Finding[]
    // A fresh tmpdir, not a path inside the fixtures directory — the SQLite
    // cache file this creates must never leak into (or persist across runs
    // in) version-controlled fixtures.
    workDir = await mkdtemp(join(tmpdir(), 'codelens-golden-'))
  }, 120_000)

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  afterEach(() => {
    client?.dispose()
    client = undefined
  })

  it('document/parse output for the golden fixture matches golden.findings.json exactly', async () => {
    client = new CodelensServiceClient({
      binaryPath,
      workspaceRoot: workDir,
      storageUri: join(workDir, 'storage'),
    })
    await client.start()

    const result = await client.parse({ uri: GOLDEN_URI, text: goldenText })

    // Note: this deep-equal is number-format-tolerant on the JS side by
    // construction — JSON.parse/JSON.stringify never distinguish `1` from
    // `1.0`, both become the plain JS number 1 — so unlike the Rust side's
    // comparison (which has to deserialize into the typed Finding struct
    // to sidestep serde_json::Value's format-sensitive equality), this
    // straightforward JSON round-trip comparison is already correct.
    expect(result.findings).toEqual(goldenFindings)
  })
})
