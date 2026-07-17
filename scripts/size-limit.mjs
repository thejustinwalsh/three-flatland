#!/usr/bin/env node

/**
 * Wrapper around size-limit that:
 * 1. Filters out entries whose paths don't exist (for base branch compat)
 * 2. Appends raw + brotli file sizes for WASM binaries
 */

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { brotliCompressSync, constants } from 'node:zlib'

const root = process.cwd()
const configPath = resolve(root, '.size-limit.cjs')

// Dynamic require to load .cjs config
const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)
const config = require(configPath)

// WASM binaries measured as raw + brotli file sizes
const wasmEntries = [
  { name: '@three-flatland/skia/wasm/wgpu', path: 'packages/skia/dist/skia-wgpu/skia-wgpu.opt.wasm' },
  { name: '@three-flatland/skia/wasm/gl', path: 'packages/skia/dist/skia-gl/skia-gl.opt.wasm' },
]

function brotliSize(buf) {
  return brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
  }).byteLength
}

// Filter config to only entries whose paths exist
const filtered = config.filter((entry) => {
  const fullPath = resolve(root, entry.path)
  if (existsSync(fullPath)) return true
  console.error(`size-limit: skipping "${entry.name}" — ${entry.path} not found`)
  return false
})

// Size-limit needs a JSON config for --config flag (can't pass .cjs with functions
// through the filtered temp file). Convert filtered entries to plain objects.
const jsonSafe = filtered.map(({ modifyEsbuildConfig, ...rest }) => rest)

// Always emit a .cjs temp config that (1) re-attaches each entry's original
// modifyEsbuildConfig and (2) composes a `node:*` external. tsdown keeps the
// `node:` prefix on builtins in the ESM output, and node-only deps (e.g.
// @three-flatland/bake) get bundled into browser size checks — esbuild can't
// resolve `node:path` for platform browser. Marking node: builtins external is
// correct anyway: a shipped bundle never contains them.
const tmpCjsConfig = resolve(root, '.size-limit-filtered.cjs')
const lines = [
  `const original = require('./.size-limit.cjs')`,
  `const byName = Object.fromEntries(original.map((e) => [e.name, e]))`,
  `const nodeExternal = (config) => { config.external = [...(config.external || []), 'node:*']; return config }`,
  `module.exports = ${JSON.stringify(jsonSafe, null, 2)}.map((e) => {`,
  `  const inner = byName[e.name] && byName[e.name].modifyEsbuildConfig`,
  `  e.modifyEsbuildConfig = inner ? (c) => nodeExternal(inner(c)) : nodeExternal`,
  `  return e`,
  `})`,
]
writeFileSync(tmpCjsConfig, lines.join('\n'))
const configArg = tmpCjsConfig

const isJson = process.argv.includes('--json')
const args = process.argv.slice(2).join(' ')

function getWasmEntries() {
  const results = []
  for (const entry of wasmEntries) {
    const fullPath = resolve(root, entry.path)
    if (!existsSync(fullPath)) continue
    const buf = readFileSync(fullPath)
    results.push({ name: `${entry.name} (raw)`, size: buf.byteLength })
    results.push({ name: `${entry.name} (brotli)`, size: brotliSize(buf) })
  }
  return results
}

/**
 * Sort: three-flatland → @three-flatland/* (with WASM) → minis/
 */
function sortResults(results) {
  function sortKey(name) {
    if (name.startsWith('three-flatland')) return `0_${name}`
    if (name.startsWith('@three-flatland')) return `1_${name.replace('(raw)', '(0raw)').replace('(brotli)', '(1brotli)')}`
    if (name.startsWith('minis/')) return `2_${name}`
    return `3_${name}`
  }
  return results.sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
}

try {
  const output = execSync(`pnpm exec size-limit --config ${configArg} ${args}`, {
    cwd: root,
    stdio: isJson ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf-8',
  })

  if (isJson && output) {
    const results = JSON.parse(output)
    results.push(...getWasmEntries())
    process.stdout.write(JSON.stringify(sortResults(results)))
  }
} catch (e) {
  if (isJson && e.stdout) {
    try {
      const results = JSON.parse(e.stdout)
      results.push(...getWasmEntries())
      process.stdout.write(JSON.stringify(sortResults(results)))
    } catch {
      process.stderr.write(e.stdout || '')
    }
  }
  process.exit(e.status || 1)
}
