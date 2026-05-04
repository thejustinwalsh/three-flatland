import { createWasiImports } from './wasi-shim.js'

export interface BasisExports {
  memory: WebAssembly.Memory
  fl_basis_alloc: (bytes: number) => number
  fl_basis_free: (ptr: number) => void
  fl_basis_init: () => number
  fl_basis_set_simd: (enabled: number) => void
  fl_basis_encoder_create: () => number
  fl_basis_encoder_destroy: (enc: number) => void
  fl_basis_encode: (
    enc: number,
    rgba: number,
    w: number,
    h: number,
    opts: number,
    outPtr: number,
    outLen: number,
  ) => number
}

let modPromise: Promise<BasisExports> | null = null

export function __resetForTest(): void {
  modPromise = null
}

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

async function loadBytes(): Promise<Uint8Array<ArrayBuffer>> {
  if (isNode()) {
    const [{ readFileSync }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ])
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/runtime/basis-loader.js -> ../../libs/basis/basis_encoder.wasm
    // src/runtime/basis-loader.ts (vitest) -> ../../libs/basis/basis_encoder.wasm
    const wasmPath = join(here, '../../libs/basis/basis_encoder.wasm')
    return readFileSync(wasmPath)
  }
  // Browser: rely on the bundler (Vite) resolving the asset URL.
  const url = new URL('../../libs/basis/basis_encoder.wasm', import.meta.url).href
  const res = await fetch(url)
  if (!res.ok) throw new Error(`basis_encoder.wasm fetch failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export function loadBasisWasm(): Promise<BasisExports> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    const bytes = await loadBytes()
    const memoryRef: { current: WebAssembly.Memory | null } = { current: null }
    const imports: WebAssembly.Imports = {
      wasi_snapshot_preview1: createWasiImports(() => {
        if (!memoryRef.current) throw new Error('memory not yet bound')
        return memoryRef.current
      }),
    }
    const result = await (WebAssembly.instantiate as (
      bytes: BufferSource,
      imports: WebAssembly.Imports,
    ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes, imports)
    const instance = result.instance
    const exports = instance.exports as unknown as BasisExports
    memoryRef.current = exports.memory
    // Reactor model: the wasm has _initialize as the entry; calling it before
    // any fl_* function ensures global ctors and basisu_encoder_init have run.
    const init = (instance.exports as unknown as { _initialize?: () => void })._initialize
    if (typeof init === 'function') init()
    const rc = exports.fl_basis_init()
    if (rc !== 0) throw new Error(`fl_basis_init failed: ${rc}`)
    // Runtime A/B switch: lets benchmarks compare SIMD vs scalar without rebuilding.
    const noSimd = typeof process !== 'undefined' && process.env?.FL_BASIS_NO_SIMD === '1'
    exports.fl_basis_set_simd(noSimd ? 0 : 1)
    return exports
  })()
  return modPromise
}
