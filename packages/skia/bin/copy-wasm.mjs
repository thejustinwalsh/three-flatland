#!/usr/bin/env node

/**
 * Copy Skia WASM files to your project's public directory.
 *
 * Usage:
 *   npx @three-flatland/skia copy-wasm [target-dir]
 *   npx @three-flatland/skia copy-wasm public/wasm
 *   npx @three-flatland/skia copy-wasm --gl-only public/wasm
 *   npx @three-flatland/skia copy-wasm --wgpu-only public/wasm
 *
 * Default target: ./public/skia
 *
 * After copying, configure your bundler to set the WASM URL:
 *   Vite:    define: { 'import.meta.env.SKIA_WASM_URL_GL': '"/skia/skia-gl.wasm"' }
 *   Webpack: DefinePlugin({ 'process.env.SKIA_WASM_URL_GL': '"/skia/skia-gl.wasm"' })
 *
 * Or pass the URL directly:
 *   Skia.init(renderer, { wasmUrl: '/skia/skia-gl.wasm' })
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_DIST = resolve(__dirname, '..', 'dist')

const args = process.argv.slice(2)
const glOnly = args.includes('--gl-only')
const wgpuOnly = args.includes('--wgpu-only')
const positional = args.filter(a => !a.startsWith('--'))
const target = resolve(process.cwd(), positional[0] || 'public/skia')

const variants = glOnly ? ['gl'] : wgpuOnly ? ['wgpu'] : ['gl', 'wgpu']

mkdirSync(target, { recursive: true })

let copied = 0
for (const v of variants) {
  const src = join(PKG_DIST, `skia-${v}`, `skia-${v}.wasm`)
  const dest = join(target, `skia-${v}.wasm`)

  if (!existsSync(src)) {
    console.error(`  ✗ ${src} not found — run 'pnpm build' in @three-flatland/skia first`)
    continue
  }

  copyFileSync(src, dest)
  console.log(`  ✓ ${dest}`)
  copied++
}

if (copied > 0) {
  const relTarget = target.replace(process.cwd() + '/', '')
  console.log(`\nCopied ${copied} WASM file(s) to ${relTarget}/`)
  console.log(`\nConfigure your app to load from this path:`)
  console.log(`  Skia.init(renderer, { wasmUrl: '/${relTarget}/skia-gl.wasm' })`)
  console.log(`\nOr set env vars (replaced at build time by Vite/Webpack):`)
  if (variants.includes('gl')) {
    console.log(`  SKIA_WASM_URL_GL=/${relTarget}/skia-gl.wasm`)
  }
  if (variants.includes('wgpu')) {
    console.log(`  SKIA_WASM_URL_WGPU=/${relTarget}/skia-wgpu.wasm`)
  }
} else {
  process.exit(1)
}
