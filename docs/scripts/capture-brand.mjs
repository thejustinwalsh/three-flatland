#!/usr/bin/env node
/**
 * Capture the BrandAsset compositions rendered live on `/branding/` and
 * save them as PNGs under `docs/public/social/`. Used to regenerate
 * `og-image.png`, `x-card-image.png`, and `bk-banner-image.png` when
 * `BrandAsset.astro` changes.
 *
 * Unlike `capture-examples.mjs` (which reads canvas pixel buffers
 * directly because the targets are r3f canvases), this script uses
 * Playwright's `locator.screenshot()` because the targets are plain
 * HTML/CSS elements — the element screenshot is exactly what we want
 * (rendered region of a DOM node, no overlapping concerns since the
 * capture targets are absolutely-positioned and the scanlines are
 * gone in the new substrate).
 *
 * Usage:
 *   pnpm --filter=docs capture:brand        # all 5 artifacts
 *   pnpm --filter=docs capture:brand og social-x  # filtered subset
 *
 * Prereq: docs dev server running on port 4321. Auto-spawned if not
 * already up; reused if found, same pattern as capture-examples.
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Configuration ──────────────────────────────────────────────────────

const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`
const BRANDING_PATH = '/three-flatland/branding/'

/**
 * Each artifact maps a `<BrandAsset isCapture>` element ID on the
 * /branding/ page to an output filename + dimensions. The dimensions
 * are duplicated from BrandAsset.astro deliberately so the capture
 * script asserts what we expect to render.
 */
const ARTIFACTS = [
  // Used by og:image meta tag — the most-referenced asset.
  { id: 'capture-og', file: 'og-image.png', w: 1200, h: 630 },
  // Used by twitter:image meta tag.
  { id: 'capture-social-x', file: 'x-card-image.png', w: 1200, h: 628 },
  // Bluesky profile banner.
  { id: 'capture-wide', file: 'bk-banner-image.png', w: 3000, h: 1000 },
  // GitHub repo social preview / generic banner — not currently linked
  // from meta tags but kept alongside for the /branding/ page.
  { id: 'capture-banner', file: 'repo-banner-image.png', w: 1280, h: 640 },
  // Pixel-art icon at full mark size for any reuse.
  { id: 'capture-icon-only', file: 'icon-512.png', w: 512, h: 512 },
]

const VIEWPORT = { width: 3200, height: 1400 } // big enough for the 3000-wide banner
const SETTLE_MS = 1_500
const OUT_DIR = resolve(__dirname, '..', 'public', 'social')

// ── Helpers ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filter = args.length > 0 ? new Set(args) : null
// Match against either the bare slug ("og") or the capture-id ("capture-og").
const matches = (a) =>
  filter === null ||
  filter.has(a.id) ||
  filter.has(a.id.replace(/^capture-/, '')) ||
  filter.has(a.file.replace(/\.png$/, ''))
const targets = ARTIFACTS.filter(matches)

if (targets.length === 0) {
  console.error(
    `[capture-brand] No matching artifacts for filter [${args.join(', ')}].\n` +
      `Available: ${ARTIFACTS.map((a) => a.id.replace(/^capture-/, '')).join(', ')}`
  )
  process.exit(1)
}

const DOCS_PKG_DIR = resolve(__dirname, '..')
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

const browser = await chromium.launch({
  // No special GPU flags needed — these are CSS-only assets.
})

let totalOk = 0
let totalFail = 0

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1, // 1:1 with asset dimensions; output PNG = exact pixel size.
    reducedMotion: 'reduce', // Pin any subtle animations so captures are stable.
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    const t = msg.type()
    if (t === 'error' || t === 'warning') {
      process.stdout.write(`[browser:${t}] ${msg.text()}\n`)
    }
  })

  process.stdout.write(`[capture-brand]   navigating to ${BRANDING_PATH}...`)
  await page.goto(`${BASE_URL}${BRANDING_PATH}`, { waitUntil: 'domcontentloaded' })
  process.stdout.write(' ok\n')

  // Wait for first BrandAsset to mount + CSS to apply. We wait for the
  // largest one (capture-wide at 3000px) since it carries the most
  // layout work and indicates the others have rendered too.
  process.stdout.write(`[capture-brand]   waiting for capture targets...`)
  await page.waitForSelector('#capture-wide', { state: 'attached', timeout: 15_000 })
  process.stdout.write(' ok\n')

  // The .hidden-capture-targets wrapper hides offscreen via CSS. The
  // browser still rasterizes them for layout, so locator.screenshot
  // captures the rendered output. Sanity-check the wrapper exists.
  const hiddenExists = await page.$('.hidden-capture-targets')
  if (!hiddenExists) {
    console.error(
      '[capture-brand] .hidden-capture-targets not found — branding page structure changed?'
    )
    process.exit(1)
  }

  // Reveal the capture-mode targets inline. We can't move them
  // off-page because Playwright's `locator.screenshot()` resolves the
  // bounding box via `getBoundingClientRect()` and captures from there
  // — at left:-99999px, the bbox falls outside the document and the
  // capture grabs the visible viewport instead of the element. So we
  // keep them in normal flow, stacked vertically, and let Playwright
  // scroll into view per element. The targets briefly push page
  // content down but that's invisible (we never display the page in
  // a real browser session).
  await page.addStyleTag({
    content: `
      /* Hide page chrome so nothing (sticky TOC, sidebar, mobile-toc
       * fixed nav, header) overlaps the capture targets — particularly
       * important for the 3000-wide banner whose width exceeds the
       * normal content column and runs under the right rail. */
      header,
      aside,
      .toc,
      mobile-starlight-toc,
      .alpha-ribbon,
      footer,
      .container-sidebar,
      .asset-preview-link {
        display: none !important;
      }
      main,
      .container-main,
      .main {
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .hidden-capture-targets {
        display: block !important;
        opacity: 1 !important;
        pointer-events: none !important;
      }
      .hidden-capture-targets > * {
        margin: 0 !important;
        display: block !important;
      }
    `,
  })
  await page.waitForTimeout(SETTLE_MS)
  process.stdout.write(`[capture-brand]   settled ${SETTLE_MS}ms, capturing\n`)

  for (const a of targets) {
    const out = resolve(OUT_DIR, a.file)
    const tag = `[${a.id.replace(/^capture-/, '')}]`
    process.stdout.write(`[capture-brand] ${tag.padEnd(14)} ${a.w}x${a.h} → ${a.file}`)
    try {
      const locator = page.locator(`#${a.id}`)
      const count = await locator.count()
      if (count === 0) {
        process.stdout.write(' missing #id\n')
        totalFail++
        continue
      }
      // Scroll the element into view so locator.screenshot reads the
      // correct on-screen rect. (When the page is taller than the
      // viewport — which it is, with stacked capture targets — the
      // rect resolves correctly only after the element is in-frame.)
      await locator.scrollIntoViewIfNeeded()
      await page.waitForTimeout(120) // micro-settle for any reflow / motion-layer redraw
      const buf = await locator.screenshot({
        type: 'png',
        omitBackground: false,
        scale: 'css',
      })
      await writeFile(out, buf)
      const size = `${(buf.byteLength / 1024).toFixed(0)}k`
      process.stdout.write(` ok (${size})\n`)
      totalOk++
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
