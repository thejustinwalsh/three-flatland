/**
 * Vitest setup for @three-flatland/skia
 *
 * Mocks SkiaContext.create() to use Skia's mock GPU backend.
 * All tests get a real SkiaContext without needing WebGL or WebGPU.
 *
 * The SKIA_TEST_BACKEND env var selects which WASM variant to load:
 *   - 'gl'   (default) → zig-out/bin/skia-gl.wasm   (imports from "gl" module)
 *   - 'wgpu'           → zig-out/bin/skia-wgpu.wasm  (imports from "wgpu" module)
 *
 * Both variants have skia_init_mock() which uses a mock GPU backend.
 */

import { vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SkiaContext } from '../src/ts/context'
import type { SkiaExports } from '../src/ts/types'

const BACKEND = (process.env.SKIA_TEST_BACKEND ?? 'gl') as 'gl' | 'wgpu'

/** Parse WASM binary for import declarations */
function getWasmImports(data: Buffer): Array<{ module: string; name: string }> {
  const imports: Array<{ module: string; name: string }> = []
  let i = 8
  while (i < data.length) {
    const sectionId = data[i]!; i++
    let size = 0, shift = 0
    while (true) { const b = data[i]!; i++; size |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break }
    const sectionEnd = i + size
    if (sectionId === 2) {
      let count = 0; shift = 0
      while (true) { const b = data[i]!; i++; count |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break }
      for (let j = 0; j < count; j++) {
        let modLen = 0; shift = 0
        while (true) { const b = data[i]!; i++; modLen |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break }
        const mod = data.subarray(i, i + modLen).toString('utf-8'); i += modLen
        let nameLen = 0; shift = 0
        while (true) { const b = data[i]!; i++; nameLen |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break }
        const name = data.subarray(i, i + nameLen).toString('utf-8'); i += nameLen
        const kind = data[i]!; i++
        if (kind === 0) { shift = 0; while (true) { const b = data[i]!; i++; if (!(b & 0x80)) break } }
        else if (kind === 1) { i += 3 } else if (kind === 2) { i += 2 }
        else if (kind === 3) { i += 2 } else if (kind === 4) { shift = 0; while (true) { const b = data[i]!; i++; if (!(b & 0x80)) break } }
        imports.push({ module: mod, name })
      }
      break
    }
    i = sectionEnd
  }
  return imports
}

let cachedCtx: SkiaContext | null = null

async function createMockContext(): Promise<SkiaContext> {
  if (cachedCtx) return cachedCtx

  // Read from dist/ (turbo-cached output of @three-flatland/skia#build) rather
  // than zig-out/bin/ (raw zig output, not declared as a turbo output) so that
  // warm-cache CI runs can restore the WASM without rebuilding. dist/ and
  // zig-out/bin/ contain the same module — dist is just optionally wasm-opt'd.
  const wasmName = BACKEND === 'wgpu' ? 'skia-wgpu' : 'skia-gl'
  const wasmPath = resolve(__dirname, `../dist/${wasmName}/${wasmName}.wasm`)
  const wasmBytes = readFileSync(wasmPath)
  const wasmImports = getWasmImports(wasmBytes)

  // Group imports by module and stub them all
  const modules = new Map<string, Record<string, () => number>>()
  for (const { module, name } of wasmImports) {
    if (!modules.has(module)) modules.set(module, {})
    modules.get(module)![name] = () => 0
  }

  const importObject: WebAssembly.Imports = Object.fromEntries(modules)
  const { instance } = await WebAssembly.instantiate(wasmBytes, importObject)

  // Call mock init instead of real GPU init
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(instance.exports as any).skia_init_mock()

  // Construct a real SkiaContext with the mock-initialized WASM
  const exports = instance.exports as unknown as SkiaExports
  const memory = instance.exports.memory as WebAssembly.Memory

  const ctx = Object.create(SkiaContext.prototype) as SkiaContext
  Object.defineProperties(ctx, {
    backend: { value: BACKEND === 'wgpu' ? 'wgpu' : 'webgl', writable: false },
    gl: { value: null, writable: false },
    device: { value: null, writable: false },
    _exports: { value: exports, writable: false },
    _memory: { value: memory, writable: false },
    _destroyed: { value: false, writable: true },
    _drawing: { value: false, writable: true },
    _currentDrawCtx: { value: null, writable: true },
  })

  cachedCtx = ctx
  return ctx
}

// Mock SkiaContext.create — all tests get the mock backend
vi.spyOn(SkiaContext, 'create').mockImplementation(createMockContext)

// Log which backend is being tested
console.log(`\n  Testing with ${BACKEND.toUpperCase()} backend (${BACKEND === 'wgpu' ? 'skia-wgpu.wasm' : 'skia-gl.wasm'})\n`)
