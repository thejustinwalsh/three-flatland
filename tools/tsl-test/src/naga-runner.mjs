import { readFileSync } from 'node:fs'
import { WASI } from 'node:wasi'

const [wasmPath, ...args] = process.argv.slice(2)
if (!wasmPath) throw new Error('Expected the naga.wasm path')

// naga-wasi-cli's bundled runner preopens the entire host filesystem. The
// harness needs only its temporary shader directory, so expose just cwd.
const wasi = new WASI({
  version: 'preview1',
  args: ['naga', ...args],
  env: {},
  preopens: { '.': process.cwd() },
  returnOnExit: true,
})
const module = new WebAssembly.Module(readFileSync(wasmPath))
const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi.wasiImport })
process.exitCode = wasi.start(instance) ?? 0
