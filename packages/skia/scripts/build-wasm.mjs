#!/usr/bin/env node

/**
 * WASM build orchestration script.
 *
 * Full pipeline:
 *   1. wit-bindgen c  → generate C headers from WIT (if wit-bindgen available)
 *   2. zig build      → compile Skia C++ + Zig bindings to WASM
 *   3. wasm-opt -Oz   → size optimization (optional, if wasm-opt available)
 *   4. wasm-tools component new → wrap as WIT component
 *   5. jco transpile  → generate JS + .d.ts + .core.wasm
 *   6. jco types      → generate standalone TypeScript types from WIT
 *
 * Prerequisites:
 *   - Zig >= 0.14 in PATH
 *   - wasm-tools in PATH
 *   - jco: pnpm add -D @bytecodealliance/jco
 *
 * Optional:
 *   - wasm-opt (binaryen) for size optimization
 *   - wit-bindgen for regenerating C headers from WIT
 *
 * Install all tools:
 *   ./scripts/install-zig.sh
 *   ./scripts/install-wasm-tools.sh
 *
 * Usage:
 *   node scripts/build-wasm.mjs              # Build all variants
 *   node scripts/build-wasm.mjs --gl-only    # Build GL variant only
 *   node scripts/build-wasm.mjs --wit-only   # Only regenerate WIT bindings + types
 *
 * This always compiles. Freshness (skip when the committed libs already match the
 * WASM sources) is decided one level up in setup.mjs --ensure via a source hash.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canBuildWasm } from './host-capability.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const DIST = resolve(PKG_ROOT, 'dist')
// Committed WASM artifacts live in lib/ (tracked, shipped, never wiped by `clean`).
// dist/ still holds build intermediates (.opt.wasm) and is gitignored.
const LIB = resolve(PKG_ROOT, 'lib')

const args = process.argv.slice(2)
const glOnly = args.includes('--gl-only')
const wgpuOnly = args.includes('--wgpu-only')
const witOnly = args.includes('--wit-only')

// Augment PATH with local .tools/bin for pinned tool versions
const TOOLS_BIN = resolve(PKG_ROOT, '.tools/bin')
const augmentedEnv = {
  ...process.env,
  PATH: `${TOOLS_BIN}${delimiter}${process.env.PATH}`,
  // WSL2: Zig's cache needs atomic renames which fail on NTFS (/mnt/).
  // Redirect both caches to a native Linux tmpdir if we detect WSL.
  ...(process.env.WSL_DISTRO_NAME && !process.env.ZIG_LOCAL_CACHE_DIR
    ? {
        ZIG_LOCAL_CACHE_DIR: `/tmp/skia-zig-cache`,
        ZIG_GLOBAL_CACHE_DIR: `/tmp/skia-zig-global-cache`,
      }
    : {}),
}

/** Run a command, printing it first. */
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: PKG_ROOT, env: augmentedEnv, ...opts })
}

/** Check if a binary is available in PATH (including .tools/bin). */
function hasCommand(name) {
  try {
    execSync(`which ${name}`, { stdio: 'ignore', env: augmentedEnv })
    return true
  } catch {
    return false
  }
}

// ── Resolve tool paths ──

// jco: prefer local devDependency, fall back to global
const jcoBin = resolve(PKG_ROOT, 'node_modules/.bin/jco')
const jco = existsSync(jcoBin) ? jcoBin : hasCommand('jco') ? 'jco' : null

const witFile = resolve(PKG_ROOT, 'wit/skia.wit')

// ── Step 1: WIT bindings ──

function generateWitBindings() {
  if (!existsSync(witFile)) {
    console.log('Skipping WIT bindings (wit/skia.wit not found).')
    return
  }

  // Generate C headers for Zig @cImport — both GL and WebGPU worlds
  if (hasCommand('wit-bindgen')) {
    console.log('\n=== Generating C bindings from WIT ===')
    const witDir = resolve(PKG_ROOT, 'wit')
    // Both variants use the same skia-gl WIT world — exports are identical,
    // backend differences are in the C API layer, not the WIT interface.
    run(`wit-bindgen c ${witDir} --world skia-gl --out-dir src/zig/bindings/generated/`)
  } else {
    console.log('wit-bindgen not in PATH — using committed C headers.')
  }

  // Both variants share core.zig — no code generation needed.
  // Backend differences are handled entirely in the C API layer.

  // Generate standalone TypeScript types (same API for both worlds)
  if (jco) {
    console.log('\n=== Generating TypeScript types from WIT ===')
    mkdirSync(resolve(DIST, 'types'), { recursive: true })
    const witDir2 = resolve(PKG_ROOT, 'wit')
    run(`${jco} types ${witDir2} --world-name skia-gl -o ${resolve(DIST, 'types')}`)
  }
}

generateWitBindings()

if (witOnly) {
  console.log('\nWIT bindings generated (--wit-only).')
  process.exit(0)
}

// ── Pre-flight checks for full build ──

const required = ['zig', 'wasm-tools']
const missing = required.filter((cmd) => !hasCommand(cmd))

if (missing.length > 0) {
  console.error(`\nMissing required tools: ${missing.join(', ')}`)
  console.error('\nInstall them:')
  console.error('  ./scripts/install-zig.sh')
  console.error('  ./scripts/install-wasm-tools.sh')
  process.exit(1)
}

if (!jco) {
  console.error('\nMissing jco. Install: pnpm add -D @bytecodealliance/jco')
  process.exit(1)
}

const hasWasmOpt = hasCommand('wasm-opt')
if (!hasWasmOpt) {
  console.log('wasm-opt not found — skipping size optimization.')
}

// ── Determine which variants to build ──

const variants = glOnly ? ['gl'] : wgpuOnly ? ['wgpu'] : ['gl', 'wgpu']

// ── Host capability gate: build from source, or use the committed libs ──
// If Zig can't link a native binary here (macOS 26.4+/27 dropped the arm64
// libSystem slice — ziglang/zig#31658), the from-source build is impossible.
// The compiled lib/*.wasm are COMMITTED to the repo (CI rebuilds + commits them
// on skia changes), so use those — we do NOT fetch a remote prebuilt (that would
// overwrite the tracked libs and dirty git history). Missing libs → fail.
if (!canBuildWasm()) {
  const libsPresent = variants.every((v) => existsSync(resolve(LIB, `skia-${v}.wasm`)))
  if (libsPresent) {
    console.log("\n✓ Can't compile WASM on this host — using the committed lib/*.wasm (CI rebuilds on skia changes).")
    console.log('  Edited skia sources? Push and let Linux/CI recompile and commit them.')
    process.exit(0)
  }
  console.error("\n✗ Committed skia lib/*.wasm are missing and this host can't compile them.")
  console.error('  Restore them from git or build on Linux/CI. NOT fetching a remote prebuilt.')
  process.exit(1)
}

// ── Ensure dist directories ──

for (const v of variants) {
  mkdirSync(resolve(DIST, `skia-${v}`), { recursive: true }) // intermediates (.opt.wasm)
}
mkdirSync(LIB, { recursive: true }) // final committed artifacts

// Step 2a: Generate struct layouts from Dawn header (Zig comptime → JSON)
if (hasCommand('wasmtime')) {
  console.log('\n=== Generating WGPU struct layouts (Zig comptime) ===')
  const emitSrc = resolve(PKG_ROOT, 'src/zig/emit_wgpu_layouts.zig')
  const emitWasm = resolve(PKG_ROOT, 'emit_wgpu_layouts.wasm')
  const layoutsJson = resolve(PKG_ROOT, 'src/ts/wgpu-layouts.json')
  if (existsSync(emitSrc)) {
    run(
      `zig build-exe ${emitSrc} -I src/zig/wgpu_shim -I src/zig/wgpu_shim/dawn -target wasm32-wasi -lc --name emit_wgpu_layouts`
    )
    const { execSync: exec } = await import('node:child_process')
    const json = exec(`wasmtime ${emitWasm}`, { env: augmentedEnv, cwd: PKG_ROOT })
    const { writeFileSync, unlinkSync } = await import('node:fs')
    writeFileSync(layoutsJson, json)
    unlinkSync(emitWasm)
    console.log(`  Generated ${layoutsJson}`)
  }
} else {
  console.log('wasmtime not found — using committed wgpu-layouts.json.')
}

// Step 2b: Generate enum maps from Dawn header (Python)
if (hasCommand('python3')) {
  const genScript = resolve(PKG_ROOT, 'scripts/generate-wgpu-bridge.py')
  if (existsSync(genScript)) {
    console.log('\n=== Generating WGPU enum maps (Python) ===')
    run(`python3 ${genScript}`)
  }
}

// Step 2c: Zig build — single invocation with skip flags
{
  const zigFlags = ['-Doptimize=ReleaseSmall']
  if (!variants.includes('gl')) zigFlags.push('-Dskip-gl=true')
  if (!variants.includes('wgpu')) zigFlags.push('-Dskip-wgpu=true')
  console.log(`\n=== Zig build (variants: ${variants.join(', ')}) ===`)
  run(`zig build ${zigFlags.join(' ')}`)
}

for (const variant of variants) {
  const name = `skia-${variant}`
  const wasmRaw = resolve(PKG_ROOT, `zig-out/bin/${name}.wasm`)
  const wasmOpt = resolve(DIST, `${name}/${name}.opt.wasm`)

  if (!existsSync(wasmRaw)) {
    console.error(`Expected ${wasmRaw} but not found. Zig build may have failed.`)
    process.exit(1)
  }

  // Step 3: wasm-opt size optimization (optional)
  const wasmInput = hasWasmOpt ? wasmOpt : wasmRaw
  if (hasWasmOpt) {
    // Enable WASM features that Zig/Skia use: tail-call (raster pipeline),
    // bulk-memory (memcpy/memset), exception-handling (FreeType setjmp/longjmp)
    run(
      `wasm-opt -Oz --strip-debug --enable-tail-call --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-multivalue --enable-extended-const --enable-exception-handling --enable-simd -o ${wasmOpt} ${wasmRaw}`
    )
  }

  // Step 4: Copy final WASM to lib/ (the committed, shipped location)
  const { copyFileSync } = await import('node:fs')
  copyFileSync(wasmInput, resolve(LIB, `${name}.wasm`))
  console.log(`\n  Copied ${name}.wasm to lib/`)
}

console.log('\nWASM build complete.')
