/**
 * Vitest setup for @three-flatland/skia
 *
 * Mocks SkiaContext.create() to use Skia's mock GPU backend.
 * All tests get a real SkiaContext without needing WebGL.
 */

import { vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SkiaContext } from '../src/ts/context'
import type { SkiaExports } from '../src/ts/types'
import type { SkiaWasmInstance } from '../src/ts/wasm-loader'

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

  const wasmPath = resolve(__dirname, '../zig-out/bin/skia-gl.wasm')
  const wasmBytes = readFileSync(wasmPath)
  const wasmImports = getWasmImports(wasmBytes)

  const importObject: WebAssembly.Imports = {
    gl: Object.fromEntries(wasmImports.filter(i => i.module === 'gl').map(i => [i.name, () => 0])),
    env: Object.fromEntries(wasmImports.filter(i => i.module === 'env').map(i => [i.name, () => 0])),
    wasi_snapshot_preview1: Object.fromEntries(
      wasmImports.filter(i => i.module === 'wasi_snapshot_preview1').map(i => [i.name, () => 0]),
    ),
  }

  const { instance } = await WebAssembly.instantiate(wasmBytes, importObject)

  // Call mock init instead of real GL init
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(instance.exports as any).skia_init_mock()

  // Construct a real SkiaContext with the mock-initialized WASM
  const exports = instance.exports as unknown as SkiaExports
  const memory = instance.exports.memory as WebAssembly.Memory

  const ctx = Object.create(SkiaContext.prototype) as SkiaContext
  Object.defineProperties(ctx, {
    gl: { value: null, writable: false },
    _exports: { value: exports, writable: false },
    _memory: { value: memory, writable: false },
    _destroyed: { value: false, writable: true },
    _drawing: { value: false, writable: true },
  })

  cachedCtx = ctx
  return ctx
}

// Mock SkiaContext.create — all tests get the mock backend
vi.spyOn(SkiaContext, 'create').mockImplementation(createMockContext)
