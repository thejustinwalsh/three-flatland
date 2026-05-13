#!/usr/bin/env node
/**
 * Capture the BrandAsset compositions rendered live on `/branding/`
 * and save them as WebP under `docs/public/social/`.
 *
 * For each artifact: launch context with viewport sized exactly to the
 * asset's native dimensions, navigate to /branding/, reveal that one
 * capture target full-viewport, take a full-page screenshot. Re-encode
 * PNG → WebP via sharp.
 *
 * Headless Chromium isn't bound by monitor size, so the 3000×1000
 * Bluesky banner renders fine in a 3000×1000 virtual viewport.
 *
 * Usage:
 *   pnpm --filter=docs capture:brand        # all 5 artifacts
 *   pnpm --filter=docs capture:brand og social-x  # filtered subset
 */
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Configuration ──────────────────────────────────────────────────────

const PORT = Number(process.env.CAPTURE_PORT ?? 4321)
const BASE_URL = `http://localhost:${PORT}`
const BRANDING_PATH = '/three-flatland/branding/'

// icon-only isn't referenced in any deployed asset chain (favicon is
// favicon.svg, no PNG icon refs), but kept for personal reuse —
// Discord avatar, profile pic, etc.
const ARTIFACTS = [
  { id: 'capture-og', file: 'og-image.webp', w: 1200, h: 630 },
  { id: 'capture-social-x', file: 'x-card-image.webp', w: 1200, h: 628 },
  { id: 'capture-wide', file: 'bk-banner-image.webp', w: 3000, h: 1000 },
  { id: 'capture-banner', file: 'repo-banner-image.webp', w: 1280, h: 640 },
  { id: 'capture-icon-only', file: 'icon-512.webp', w: 512, h: 512 },
]

const SETTLE_MS = 1_500
const WEBP_QUALITY = 95
const WEBP_EFFORT = 6
const OUT_DIR = resolve(__dirname, '..', 'public', 'social')

// Chromium launch args. html-in-canvas enables ctx.drawElementImage
// for future canvas-rendered use cases (not used in this script — the
// API drops CSS transforms on the source, which BrandAsset depends on).
// GPU mode matches vitexec's --gpu profile so GPU-backed compositing
// (mix-blend-modes, foil gradients) renders consistently with dev.
const BROWSER_ARGS = [
  '--enable-blink-features=CanvasDrawElement',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-webgpu',
]

// `slug` here is the data-type value on the .asset-preview-link
// (e.g., 'og', 'social-x'). Mirrors the CaptureModal's click handler.
const slugFromId = (id) => id.replace(/^capture-/, '')

// ── Helpers ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filter = args.length > 0 ? new Set(args) : null
const matches = (a) =>
  filter === null ||
  filter.has(a.id) ||
  filter.has(a.id.replace(/^capture-/, '')) ||
  filter.has(a.file.replace(/\.webp$/, ''))
const targets = ARTIFACTS.filter(matches)

if (targets.length === 0) {
  console.error(
    `[capture-brand] No matching artifacts for filter [${args.join(', ')}].\n` +
      `Available: ${ARTIFACTS.map((a) => a.id.replace(/^capture-/, '')).join(', ')}`
  )
  process.exit(1)
}

const SERVER_READY_TIMEOUT_MS = 60_000
const SERVER_POLL_INTERVAL_MS = 500
let spawnedServer = null

async function probeServer() {
  try {
    const res = await fetch(`${BASE_URL}${BRANDING_PATH}`, {
      signal: AbortSignal.timeout(2_000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  if (await probeServer()) {
    process.stdout.write(`[capture-brand] reusing existing server at ${BASE_URL}\n`)
    return
  }
  process.stdout.write(`[capture-brand] spawning docs dev server on ${PORT}...\n`)
  const child = spawn('pnpm', ['--filter=docs', 'dev'], {
    cwd: resolve(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, TURBO_MFE_PORT: String(PORT) },
  })
  spawnedServer = child
  const pipe = (stream, label) => {
    stream.on('data', (chunk) => {
      const text = chunk.toString().replace(/\n$/, '')
      if (text.length > 0) process.stdout.write(`[${label}] ${text}\n`)
    })
  }
  pipe(child.stdout, 'docs')
  pipe(child.stderr, 'docs!')
  child.on('exit', (code, signal) => {
    if (spawnedServer) {
      console.error(`[capture-brand] docs server exited unexpectedly (code=${code} signal=${signal})`)
    }
    spawnedServer = null
  })
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS))
    if (await probeServer()) {
      process.stdout.write(`[capture-brand] server ready at ${BASE_URL}\n`)
      return
    }
  }
  await teardownServer()
  console.error(`[capture-brand] docs server did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`)
  process.exit(1)
}

async function teardownServer() {
  if (!spawnedServer) return
  const child = spawnedServer
  spawnedServer = null
  process.stdout.write(`[capture-brand] tearing down docs server (pid=${child.pid})...\n`)
  child.kill('SIGTERM')
  await new Promise((res) => {
    let settled = false
    child.once('exit', () => {
      if (settled) return
      settled = true
      res()
    })
    setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGKILL')
      } catch {}
      res()
    }, 5_000)
  })
}

const teardownAndExit = (code) => {
  teardownServer().finally(() => process.exit(code))
}
process.on('SIGINT', () => teardownAndExit(130))
process.on('SIGTERM', () => teardownAndExit(143))
process.on('uncaughtException', (err) => {
  console.error('[capture-brand] uncaught exception:', err)
  teardownAndExit(1)
})

await ensureServer()
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true })

// ── Capture loop ───────────────────────────────────────────────────────

const browser = await chromium.launch({ args: BROWSER_ARGS })

let totalOk = 0
let totalFail = 0

// Single context — biggest asset (3000×1000) plus the modal's 100px
// padding on each side determines the viewport.
const VIEWPORT = { width: 3200, height: 1200 }

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') process.stdout.write(`\n  [browser:error] ${msg.text()}`)
  })

  await page.goto(`${BASE_URL}${BRANDING_PATH}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)

  for (const a of targets) {
    const out = resolve(OUT_DIR, a.file)
    const slug = slugFromId(a.id)
    const tag = `[${slug}]`
    process.stdout.write(`[capture-brand] ${tag.padEnd(14)} ${a.w}x${a.h} → ${a.file}`)
    try {
      // Click the preview link — CaptureModal listens for this and
      // opens the modal with #capture-<slug> cloned in at native size.
      await page.click(`.asset-preview-link[data-type="${slug}"]`)
      // Modal's clone has the same classes as the source, so we target
      // the visible one inside #modal-content.
      const asset = page.locator(`#modal-content .brand-asset-root.${slug}`)
      await asset.waitFor({ state: 'visible', timeout: 10_000 })
      await page.waitForTimeout(SETTLE_MS)

      const pngBuf = await asset.screenshot({ type: 'png', omitBackground: false })
      const webpBuf = await sharp(pngBuf)
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toBuffer()
      await writeFile(out, webpBuf)
      const size = `${(webpBuf.byteLength / 1024).toFixed(0)}k`
      process.stdout.write(` ok (${size})\n`)
      totalOk++

      // Close modal for next iteration.
      await page.click('#close-modal')
      await page.waitForFunction(
        () => !document.getElementById('capture-modal')?.hasAttribute('open')
      )
    } catch (err) {
      process.stdout.write(' fail\n')
      console.error(`  → ${err.message}`)
      totalFail++
    }
  }

  await context.close()
} finally {
  await browser.close()
  await teardownServer()
}

process.stdout.write(`\n[capture-brand] done — ${totalOk} ok, ${totalFail} fail\n`)
process.exit(totalFail > 0 ? 1 : 0)
