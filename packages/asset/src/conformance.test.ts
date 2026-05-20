/**
 * Conformance test suite for @three-flatland/asset.
 *
 * Reads the committed golden `sample.glb` from disk and asserts:
 *   1. GLB magic bytes are valid ("glTF")
 *   2. readAsset decodes all accessors with correct typed-array types and values
 *   3. The FL_demo extension metadata matches the expected JSON
 *   4. The official Khronos glTF-Validator reports 0 errors
 *
 * The fixture is deterministic — regenerate with:
 *   node_modules/.bin/tsx packages/asset/scripts/gen-fixture.ts
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeAll } from 'vitest'
import { readAsset } from './readAsset'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURES = resolve(__dirname, '__fixtures__')

// ---------------------------------------------------------------------------
// Types for gltf-validator (no bundled .d.ts in the package)
// ---------------------------------------------------------------------------

interface ValidationReport {
  issues: {
    numErrors: number
    numWarnings: number
    numInfos: number
    numHints: number
    messages?: Array<{ code: string; message: string; severity: number }>
  }
}

// ---------------------------------------------------------------------------
// Load fixtures and validator once before all tests
// ---------------------------------------------------------------------------

let glbBytes: ArrayBuffer
let expected: {
  metadata: {
    kind: string
    version: number
    metrics: { vertexCount: number; tileSize: number }
  }
  accessors: Record<
    string,
    { index: number; values: number[]; type: string }
  >
}

// gltf-validator is loaded lazily inside beforeAll so that it is required AFTER
// vitest.setup.ts has run and patched globalThis.navigator. The Dart-compiled
// dart.js inspects navigator.userAgent at evaluation time; if it runs during
// module collection (before setup) the stubbed navigator has no userAgent and
// the validator crashes. Deferring to beforeAll guarantees setup has completed.
let gltfValidateBytes: (
  data: Uint8Array,
  options?: Record<string, unknown>,
) => Promise<ValidationReport>

beforeAll(async () => {
  // Load GLB bytes from disk — slice to a standalone ArrayBuffer so that
  // readAsset (and the validator) receive an ArrayBuffer whose byteOffset is 0.
  const glbBuf = readFileSync(resolve(FIXTURES, 'sample.glb'))
  glbBytes = glbBuf.buffer.slice(
    glbBuf.byteOffset,
    glbBuf.byteOffset + glbBuf.byteLength,
  )

  const expectedRaw = readFileSync(resolve(FIXTURES, 'sample.expected.json'), 'utf8')
  expected = JSON.parse(expectedRaw)

  // Load gltf-validator via createRequire after setup has patched navigator.
  // The CJS entry (index.js) keeps the Dart runtime's require/exports semantics
  // intact and avoids Vite's ESM transform pipeline.
  const _require = createRequire(import.meta.url)
  const mod = _require('gltf-validator') as {
    validateBytes: (
      data: Uint8Array,
      options?: Record<string, unknown>,
    ) => Promise<ValidationReport>
  }
  gltfValidateBytes = mod.validateBytes.bind(mod)
})

// ---------------------------------------------------------------------------
// 1. GLB magic assertion
// ---------------------------------------------------------------------------

describe('sample.glb magic', () => {
  it('starts with the 4-byte glTF magic (0x67 0x6C 0x54 0x46)', () => {
    const u8 = new Uint8Array(glbBytes)
    // "glTF" in ASCII
    expect(u8[0]).toBe(0x67) // 'g'
    expect(u8[1]).toBe(0x6c) // 'l'
    expect(u8[2]).toBe(0x54) // 'T'
    expect(u8[3]).toBe(0x46) // 'F'
  })
})

// ---------------------------------------------------------------------------
// 2. readAsset — accessor values match expected
// ---------------------------------------------------------------------------

describe('readAsset decodes fixture accessors', () => {
  it('decodes floatCol as Float32Array with values [1.5, 2.5, 3.5]', () => {
    const asset = readAsset(glbBytes)
    const idx = expected.accessors['floatCol']!.index
    const view = asset.accessor(idx)

    expect(view).toBeInstanceOf(Float32Array)
    const f32 = view as Float32Array
    const vals = expected.accessors['floatCol']!.values
    expect(f32.length).toBe(vals.length)
    for (let i = 0; i < vals.length; i++) {
      expect(f32[i]).toBe(vals[i])
    }
  })

  it('decodes ushortCol as Uint16Array with values [10, 20, 30, 40]', () => {
    const asset = readAsset(glbBytes)
    const idx = expected.accessors['ushortCol']!.index
    const view = asset.accessor(idx)

    expect(view).toBeInstanceOf(Uint16Array)
    const u16 = view as Uint16Array
    const vals = expected.accessors['ushortCol']!.values
    expect(u16.length).toBe(vals.length)
    for (let i = 0; i < vals.length; i++) {
      expect(u16[i]).toBe(vals[i])
    }
  })

  it('decodes shortCol as Int16Array with values [-1, 0, 1]', () => {
    const asset = readAsset(glbBytes)
    const idx = expected.accessors['shortCol']!.index
    const view = asset.accessor(idx)

    expect(view).toBeInstanceOf(Int16Array)
    const i16 = view as Int16Array
    const vals = expected.accessors['shortCol']!.values
    expect(i16.length).toBe(vals.length)
    for (let i = 0; i < vals.length; i++) {
      expect(i16[i]).toBe(vals[i])
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Extension metadata
// ---------------------------------------------------------------------------

describe('readAsset decodes FL_demo extension metadata', () => {
  it('ext("FL_demo") returns the expected metadata and columns', () => {
    const asset = readAsset(glbBytes)
    const ext = asset.ext<Record<string, unknown>>('FL_demo')

    expect(ext).toBeDefined()

    // Scalar metadata fields
    expect(ext!['kind']).toBe(expected.metadata.kind)
    expect(ext!['version']).toBe(expected.metadata.version)

    // Nested metrics object
    const metrics = ext!['metrics'] as Record<string, unknown>
    expect(metrics).toBeDefined()
    expect(metrics['vertexCount']).toBe(expected.metadata.metrics.vertexCount)
    expect(metrics['tileSize']).toBe(expected.metadata.metrics.tileSize)

    // Columns map — accessor indices present and match expected
    const columns = ext!['columns'] as Record<string, { accessor: number }>
    expect(columns).toBeDefined()
    for (const [name, { index }] of Object.entries(expected.accessors)) {
      expect(typeof columns[name]!.accessor).toBe('number')
      expect(columns[name]!.accessor).toBe(index)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Official glTF-Validator check
//
// Uses the Khronos glTF-Validator npm package (validateBytes).
// UNSUPPORTED_EXTENSION infos (FL_demo) and UNUSED_OBJECT infos (accessors
// referenced by the custom extension only) are expected and acceptable.
// We assert only numErrors === 0.
// ---------------------------------------------------------------------------

describe('glTF-Validator', () => {
  it('reports 0 errors on sample.glb', async () => {
    const data = new Uint8Array(glbBytes)
    const report = await gltfValidateBytes(data)

    // Info-level messages about unsupported extensions and unused accessors
    // are acceptable — the GLB is structurally valid standard glTF.
    expect(report.issues.numErrors).toBe(0)
  })
})
