#!/usr/bin/env node

/**
 * Pre-publish gate — runs before `npm pack` / `npm publish`.
 *
 * In CI: just verifies artifacts exist (fast, no work).
 * Manual publish: builds if artifacts are missing (saves your ass).
 */

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')

// Paths are PKG_ROOT-relative: JS/dts under dist/ts/ (tsdown root:src → dist/ts/*),
// committed WASM under lib/ (shipped via package.json "files").
const required = [
  'dist/ts/index.js',
  'dist/ts/index.d.ts',
  'dist/ts/three/index.js',
  'dist/ts/three/index.d.ts',
  'dist/ts/react/index.js',
  'dist/ts/react/index.d.ts',
  'lib/skia-gl.wasm',
  'lib/skia-wgpu.wasm',
]

const missing = required.filter(f => !existsSync(resolve(PKG_ROOT, f)))

if (missing.length === 0) {
  console.log('  \x1b[32m✓\x1b[0m All publish artifacts present')
  process.exit(0)
}

// CI: don't attempt a build, just fail fast
if (process.env.CI) {
  for (const f of missing) console.error(`  \x1b[31m✗\x1b[0m Missing: ${f}`)
  console.error('\nCI publish blocked — build step did not produce all artifacts.\n')
  process.exit(1)
}

// Manual: attempt to build
console.log(`  \x1b[33m⚠\x1b[0m ${missing.length} artifact(s) missing — running build...`)
try {
  execSync('pnpm build', { stdio: 'inherit', cwd: PKG_ROOT })
} catch {
  console.error('\nBuild failed. Cannot publish.\n')
  process.exit(1)
}

// Verify again
const stillMissing = required.filter(f => !existsSync(resolve(PKG_ROOT, f)))
if (stillMissing.length > 0) {
  for (const f of stillMissing) console.error(`  \x1b[31m✗\x1b[0m Still missing: ${f}`)
  console.error('\nBuild completed but artifacts are still missing.\n')
  process.exit(1)
}

console.log('  \x1b[32m✓\x1b[0m Build complete, all artifacts present')
