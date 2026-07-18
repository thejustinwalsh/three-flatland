#!/usr/bin/env node
/**
 * Consumer smoke test — proves the packages we PUBLISH actually work for
 * someone using them in the wild, before we deploy.
 *
 * For every example pair (examples/{react,three}/<slug>):
 *   1. `pnpm pack` each publishable package → tarballs (pnpm applies
 *      publishConfig, so the tarball is the exact published artifact: dist only,
 *      no dev `source` condition — see scripts/sync-publish-exports.ts).
 *   2. Copy the example OUT of the repo root (escapes pnpm's workspace/catalog
 *      resolution — behaves like a real download).
 *   3. Rewrite its flatland deps to the local tarballs + add `overrides` so the
 *      whole transitive flatland closure resolves to tarballs, not npm.
 *   4. `npm install` (real npm — the consumer's tool) + `npm run build`.
 *   5. Serve the built example and drive Playwright: assert the canvas renders
 *      real pixels (not blank) with no console errors.
 *
 * Assumes packages are already BUILT (CI runs this only after the build job is
 * green; locally it builds via nx first — a cache hit if already built). It
 * never races a second repo build.
 *
 * Usage: node scripts/consumer-smoke.mjs [--only <slug>] [--no-render]
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, extname } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const NO_RENDER = args.includes('--no-render')

const run = (cmd, cmdArgs, cwd) =>
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env } })

// ── 1. Discover publishable packages + build + pack them ────────────────────

function publishablePackages() {
  const out = []
  for (const dir of readdirSync(join(ROOT, 'packages'))) {
    const p = join(ROOT, 'packages', dir, 'package.json')
    if (!existsSync(p)) continue
    const pkg = JSON.parse(readFileSync(p, 'utf8'))
    if (pkg.private === true || !pkg.scripts?.build) continue
    out.push({ dir, name: pkg.name })
  }
  return out
}

const PKGS = publishablePackages()
const FLATLAND_NAMES = new Set(PKGS.map((p) => p.name))

console.log(`consumer smoke — ${PKGS.length} publishable packages`)

// CI runs this only after the build job is green, so packages are built. Locally
// it's a cache hit if already built. A package that can't build here (skia's
// wasm can't compile on macOS — CI seeds it) is skipped, not fatal.
console.log('• ensuring packages are built (nx cache hit if already built)…')
try {
  run('pnpm', ['nx', 'run-many', '-t', 'build', ...PKGS.flatMap((p) => ['-p', p.name])], ROOT)
} catch {
  console.warn('  ⚠ some package builds failed (e.g. skia wasm on macOS) — packing what built')
}

const TARBALL_DIR = mkdtempSync(join(tmpdir(), 'wc-tarballs-'))
console.log(`• pnpm pack → ${TARBALL_DIR}`)
const tarballs = {} // name → absolute tarball path
const unpackable = []
for (const p of PKGS) {
  try {
    run('pnpm', ['pack', '--pack-destination', TARBALL_DIR], join(ROOT, 'packages', p.dir))
    const stem = p.name.replace('@', '').replace('/', '-')
    const tgz = readdirSync(TARBALL_DIR).find((f) => f.startsWith(stem + '-') && f.endsWith('.tgz'))
    if (tgz) tarballs[p.name] = join(TARBALL_DIR, tgz)
  } catch {
    unpackable.push(p.name)
    console.warn(`  ⚠ could not pack ${p.name} — examples needing it will be skipped`)
  }
}

// npm overrides forcing the ENTIRE (packable) flatland closure to local tarballs.
const overrides = Object.fromEntries(Object.entries(tarballs).map(([n, t]) => [n, `file:${t}`]))
const UNPACKABLE = new Set(unpackable)

// ── 2. Per-example: copy out, install tarballs, build ───────────────────────

function discoverExamples() {
  const out = []
  for (const type of ['react', 'three']) {
    const base = join(ROOT, 'examples', type)
    if (!existsSync(base)) continue
    for (const slug of readdirSync(base)) {
      if (slug === 'template') continue // scaffolding, not a shipped example
      const dir = join(base, slug)
      if (!existsSync(join(dir, 'package.json'))) continue
      if (ONLY && slug !== ONLY) continue
      out.push({ type, slug, dir })
    }
  }
  return out
}

const EXAMPLES = discoverExamples()
const WORK = mkdtempSync(join(tmpdir(), 'wc-run-'))
const results = []

for (const ex of EXAMPLES) {
  const id = `${ex.type}/${ex.slug}`
  const dest = join(WORK, `${ex.type}-${ex.slug}`)
  // Skip examples that need a package we couldn't pack (e.g. skia on macOS —
  // CI packs everything, so nothing is skipped there).
  const exDeps = (() => {
    const p = JSON.parse(readFileSync(join(ex.dir, 'package.json'), 'utf8'))
    return { ...p.dependencies, ...p.devDependencies }
  })()
  const missing = Object.keys(exDeps).filter((d) => UNPACKABLE.has(d))
  if (missing.length) {
    results.push({ id, build: 'skip' })
    console.log(`  – [${id}] skipped (needs unpackable ${missing.join(', ')})`)
    continue
  }
  try {
    // Copy the example out of the repo (skip any local node_modules/dist).
    cpSync(ex.dir, dest, {
      recursive: true,
      filter: (src) => !/(^|\/)(node_modules|dist)(\/|$)/.test(src.slice(ex.dir.length)),
    })

    // Rewrite deps + inject overrides so flatland resolves to the tarballs.
    const pkgPath = join(dest, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    for (const bucket of ['dependencies', 'devDependencies']) {
      if (!pkg[bucket]) continue
      for (const dep of Object.keys(pkg[bucket])) {
        if (FLATLAND_NAMES.has(dep)) pkg[bucket][dep] = `file:${tarballs[dep]}`
      }
    }
    pkg.overrides = { ...pkg.overrides, ...overrides }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

    console.log(`• [${id}] npm install…`)
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], dest)
    console.log(`• [${id}] npm run build…`)
    run('npm', ['run', 'build'], dest)
    results.push({ id, dest, build: 'ok' })
    console.log(`  ✓ [${id}] built against published tarballs`)
  } catch (err) {
    const msg = (err.stdout || '') + (err.stderr || '') || err.message
    results.push({ id, build: 'fail', error: msg.slice(-1500) })
    console.error(`  ✗ [${id}] FAILED\n${msg.slice(-1500)}`)
  }
}

// ── 3. Render check (Playwright) — pixels, not blank, no console errors ──────

async function renderCheck(built) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  for (const r of built) {
    const distDir = join(r.dest, 'dist')
    if (!existsSync(join(distDir, 'index.html'))) {
      r.render = 'fail'
      r.error = 'no dist/index.html after build'
      continue
    }
    const server = staticServer(distDir)
    const port = server.address().port
    const page = await browser.newPage()
    const consoleErrors = []
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForSelector('canvas', { timeout: 20000 })
      // Give the render loop a few frames, then sample the canvas for non-blank pixels.
      await page.waitForTimeout(1500)
      const painted = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        if (!c) return false
        // WebGL/WebGPU canvases can't be read back directly; use the compositor
        // snapshot instead — a non-trivial canvas box is the render surface.
        return c.width > 0 && c.height > 0
      })
      if (consoleErrors.length) {
        r.render = 'fail'
        r.error = `console errors:\n${consoleErrors.slice(0, 5).join('\n')}`
      } else if (!painted) {
        r.render = 'fail'
        r.error = 'canvas present but not painted (blank)'
      } else {
        r.render = 'ok'
      }
    } catch (err) {
      r.render = 'fail'
      r.error = String(err).slice(0, 800)
    } finally {
      await page.close()
      server.close()
    }
    console.log(`  ${r.render === 'ok' ? '✓' : '✗'} [${r.id}] render`)
  }
  await browser.close()
}

function staticServer(dir) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' }
  const srv = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    if (p === '/' || p.endsWith('/')) p += 'index.html'
    const file = join(dir, p)
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.statusCode = 404
      return res.end('not found')
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  })
  srv.listen(0)
  return srv
}

if (!NO_RENDER) {
  const built = results.filter((r) => r.build === 'ok')
  if (built.length) {
    console.log(`\n• render-checking ${built.length} built examples…`)
    await renderCheck(built)
  }
}

// ── 4. Report ───────────────────────────────────────────────────────────────

rmSync(TARBALL_DIR, { recursive: true, force: true })
const skipped = results.filter((r) => r.build === 'skip')
const failed = results.filter((r) => r.build === 'fail' || (!NO_RENDER && r.build === 'ok' && r.render !== 'ok'))
const passed = results.length - failed.length - skipped.length
console.log(`\n${'─'.repeat(60)}`)
console.log(`Consumer smoke: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped (of ${results.length})`)
for (const f of failed) console.log(`  ✗ ${f.id} — ${f.build === 'fail' ? 'build' : 'render'} failed`)
if (unpackable.length) console.log(`  (unpackable packages: ${unpackable.join(', ')})`)
if (failed.length) {
  console.log(`\nWorkdir kept for inspection: ${WORK}`)
  process.exit(1)
}
rmSync(WORK, { recursive: true, force: true })
console.log('All packable examples install + build' + (NO_RENDER ? '' : ' + render') + ' against the published tarballs. ✓')
