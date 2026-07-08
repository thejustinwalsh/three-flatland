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

    // The specific regression this fixture exists to prevent: a
    // type-annotated declarator's defRange must land INSIDE the
    // initializer, past the `=` — not at the declarator's start (the
    // name). golden.ts's `explosionPreset` is `const explosionPreset:
    // number[] = [0.6, ...]`; `=` sits at character 32 on that line, so a
    // defRange starting at or before 32 would mean the old,
    // whole-declarator bug is back (it would have deleted the variable's
    // name and type annotation on a write-back).
    const explosionFinding = result.findings.find(
      (f) => f.kind === 'zzfx.call' && f.payload.varRef?.name === 'explosionPreset'
    )
    expect(
      explosionFinding,
      'golden.ts must still declare and reference explosionPreset'
    ).toBeDefined()
    if (explosionFinding?.kind !== 'zzfx.call') throw new Error('expected zzfx.call')
    const defRange = explosionFinding.payload.varRef!.defRange
    expect(defRange, 'explosionPreset has an initializer; defRange must be present').toBeDefined()
    expect(defRange!.start.character).toBeGreaterThan(32)

    // zzfxm.song var-form: same "past the `=`" contract, same
    // resolve_var_ref path as zzfx's varRef.defRange above.
    const laserSongFinding = result.findings.find(
      (f) => f.kind === 'zzfxm.song' && f.payload.varRef?.name === 'laserSong'
    )
    expect(laserSongFinding, 'golden.ts must still declare and reference laserSong').toBeDefined()
    if (laserSongFinding?.kind !== 'zzfxm.song') throw new Error('expected zzfxm.song')
    const songDefRange = laserSongFinding.payload.varRef!.defRange
    expect(songDefRange, 'laserSong has an initializer; defRange must be present').toBeDefined()
    expect(songDefRange!.start.character).toBeGreaterThan(16)

    // zzfxm.song literal form: no varRef key present at all (not `null`).
    const inlineSongFinding = result.findings.find(
      (f) => f.kind === 'zzfxm.song' && f.payload.argRange.start.character === 8
    )
    expect(
      inlineSongFinding,
      'golden.ts must still contain the inline-literal zzfxm call'
    ).toBeDefined()
    if (inlineSongFinding?.kind !== 'zzfxm.song') throw new Error('expected zzfxm.song')
    expect(inlineSongFinding.payload.varRef).toBeUndefined()

    // audio.file: pathRange must slice to exactly the path out of the real
    // golden.ts source text — the TS-side twin of golden.rs's same check.
    const ambientFindings = result.findings.filter(
      (f) => f.kind === 'audio.file' && f.payload.path.startsWith('ambient.')
    )
    expect(ambientFindings).toHaveLength(2)
    for (const finding of ambientFindings) {
      if (finding.kind !== 'audio.file') throw new Error('expected audio.file')
      const lines = goldenText.split('\n')
      const line = lines[finding.payload.pathRange.start.line]!
      const sliced = line.slice(
        finding.payload.pathRange.start.character,
        finding.payload.pathRange.end.character
      )
      expect(sliced).toBe(finding.payload.path)
    }

    // Wad (github.com/rserota/wad) coverage, pinned by name rather than
    // implied by the more generic nested-object case above: file-mode
    // source IS a finding (slice-equality-proven, same discipline as the
    // Howler case), synthesis-mode source ('sine', no audio extension)
    // is NOT — both directions asserted explicitly.
    const wadFinding = result.findings.find(
      (f) => f.kind === 'audio.file' && f.payload.path === 'sounds/jump.wav'
    )
    expect(
      wadFinding,
      'golden.ts must still reference sounds/jump.wav via new Wad({...})'
    ).toBeDefined()
    if (wadFinding?.kind !== 'audio.file') throw new Error('expected audio.file')
    const wadLines = goldenText.split('\n')
    const wadLine = wadLines[wadFinding.payload.pathRange.start.line]!
    const wadSliced = wadLine.slice(
      wadFinding.payload.pathRange.start.character,
      wadFinding.payload.pathRange.end.character
    )
    expect(wadSliced).toBe(wadFinding.payload.path)

    const sineFinding = result.findings.find(
      (f) => f.kind === 'audio.file' && f.payload.path === 'sine'
    )
    expect(
      sineFinding,
      "new Wad({source: 'sine'}) is synthesis mode, not a file reference — must NOT be a finding"
    ).toBeUndefined()

    // Expanded Wad coverage (#44), the TS twin of golden.rs's block: the
    // depth-agnostic scanner reaches Wad's other file-referencing shapes
    // (reverb impulse two levels down, the SoundIterator files array) with
    // no Wad-specific code, and the full synthesis vocabulary stays out.
    for (const [wadCase, wadPath] of [
      ['convolution reverb impulse ({reverb:{impulse}})', 'ir.wav'],
      ['SoundIterator files array', 'riff.mp3'],
    ] as const) {
      const found = result.findings.find(
        (f) => f.kind === 'audio.file' && f.payload.path === wadPath
      )
      expect(found, `golden.ts must still reference ${wadPath} via Wad's ${wadCase}`).toBeDefined()
      if (found?.kind !== 'audio.file') throw new Error('expected audio.file')
      const foundLine = goldenText.split('\n')[found.payload.pathRange.start.line]!
      expect(
        foundLine.slice(
          found.payload.pathRange.start.character,
          found.payload.pathRange.end.character
        )
      ).toBe(found.payload.path)
    }
    for (const synth of ['square', 'sawtooth', 'triangle', 'noise', 'mic']) {
      expect(
        result.findings.find((f) => f.kind === 'audio.file' && f.payload.path === synth),
        `new Wad({source: '${synth}'}) is synthesis mode — must NOT be a finding`
      ).toBeUndefined()
    }
  })
})
