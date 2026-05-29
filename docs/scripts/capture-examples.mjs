#!/usr/bin/env node
/**
 * Capture stills + short videos of every example for the gallery
 * masonry. Headless Playwright drives the examples dev server (the
 * same one `e2e/smoke-examples.spec.ts` uses), then records the
 * `<canvas>` buffer directly via `canvas.captureStream(30)` +
 * `MediaRecorder` — no devtools overlays, no stats panel, no
 * Tweakpane chrome end up in the recording. Outputs to:
 *
 *   docs/public/captures/<slug>.png    (poster still, full canvas)
 *   docs/public/captures/<slug>.webm   (looping clip, ~6s)
 *
 * GalleryTile then loads the still as a poster and lazy-swaps the
 * webm in on hover. See `docs/src/components/gallery/GalleryTile.astro`.
 *
 * Usage:
 *   pnpm --filter=docs capture:examples            # all examples (Three side)
 *   pnpm --filter=docs capture:examples basic-sprite tilemap
 *
 * Prereq: examples dev server running on port 5174. Start it with
 * `pnpm --filter=examples dev` in another terminal, or use the root
 * `pnpm dev` which boots both docs + examples behind microfrontends.
 */
// `@playwright/test` re-exports the chromium browser type and is
// already a workspace devDependency (used by e2e/smoke-examples.spec.ts).
// Importing from there avoids a separate `playwright` install.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Configuration ──────────────────────────────────────────────────────

const PORT = 5174
const BASE_URL = `http://localhost:${PORT}`

/** Inventory of slugs that map 1:1 to `examples/three/<slug>/` and to
 *  `docs/src/content/docs/examples/<slug>.mdx`. Capture the Three.js
 *  side; React side is the same scene visually. Showcases captured
 *  via their own subpath under `examples/three/` (e.g. mini-breakout
 *  has its own bundled showcase route — left for a separate runner
 *  if/when more showcases land). */
const EXAMPLES = [
  { slug: 'basic-sprite', surface: 'examples', path: 'three/basic-sprite' },
  { slug: 'animation', surface: 'examples', path: 'three/animation' },
  { slug: 'batch-demo', surface: 'examples', path: 'three/batch-demo' },
  { slug: 'knightmark', surface: 'examples', path: 'three/knightmark' },
  { slug: 'pass-effects', surface: 'examples', path: 'three/pass-effects' },
  { slug: 'tsl-nodes', surface: 'examples', path: 'three/tsl-nodes' },
  { slug: 'tilemap', surface: 'examples', path: 'three/tilemap' },
  { slug: 'skia', surface: 'examples', path: 'three/skia' },
  { slug: 'slug-text', surface: 'examples', path: 'three/slug-text' },
  { slug: 'lighting', surface: 'examples', path: 'three/lighting' },
]

const VIDEO_DURATION_MS = 6_000
const VIDEO_FPS = 30
const CANVAS_SETTLE_MS = 1_500
const VIEWPORT = { width: 1280, height: 800 }
const OUT_DIR = resolve(__dirname, '..', 'public', 'captures')

// ── Helpers ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filter = args.length > 0 ? new Set(args) : null
const targets = filter ? EXAMPLES.filter((e) => filter.has(e.slug)) : EXAMPLES

if (targets.length === 0) {
  console.error(
    `[capture] No matching examples for filter [${args.join(', ')}].\n` +
      `Available slugs: ${EXAMPLES.map((e) => e.slug).join(', ')}`
  )
  process.exit(1)
}

/**
 * Spawn the examples MFE dev server as a child of this script and tear
 * it down on completion (or failure / Ctrl-C). Avoids leaking a vite
 * process across capture runs — previously the script assumed an
 * already-running `pnpm dev`, which often left stale servers behind
 * and caused mysterious "old content" loads on subsequent runs.
 *
 * If a server is already listening on PORT (e.g. user has `pnpm dev`
 * up in another terminal), reuse it and skip the spawn — running
 * captures should not interfere with their workflow.
 */
const EXAMPLES_PKG_DIR = resolve(__dirname, '..', '..', 'examples')
const SERVER_READY_TIMEOUT_MS = 60_000
const SERVER_POLL_INTERVAL_MS = 500
let spawnedServer = null

async function probeServer() {
  try {
    const res = await fetch(`${BASE_URL}/three/basic-sprite/`, {
      signal: AbortSignal.timeout(2_000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  if (await probeServer()) {
    process.stdout.write(`[capture] reusing existing server at ${BASE_URL}\n`)
    return
  }
  process.stdout.write(`[capture] spawning examples dev server on ${PORT}...\n`)
  const child = spawn('pnpm', ['--filter=examples', 'dev'], {
    cwd: resolve(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  spawnedServer = child
  // Pipe child output through with a prefix so server logs are visible
  // but distinguishable from capture output.
  const pipe = (stream, label) => {
    stream.on('data', (chunk) => {
      const text = chunk.toString().replace(/\n$/, '')
      if (text.length > 0) process.stdout.write(`[${label}] ${text}\n`)
    })
  }
  pipe(child.stdout, 'examples')
  pipe(child.stderr, 'examples!')
  child.on('exit', (code, signal) => {
    if (spawnedServer) {
      // Crashed before our explicit teardown.
      console.error(`[capture] examples server exited unexpectedly (code=${code} signal=${signal})`)
    }
    spawnedServer = null
  })
  // Poll until the server responds.
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS))
    if (await probeServer()) {
      process.stdout.write(`[capture] server ready at ${BASE_URL}\n`)
      return
    }
  }
  await teardownServer()
  console.error(`[capture] examples server did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`)
  process.exit(1)
}

async function teardownServer() {
  if (!spawnedServer) return
  const child = spawnedServer
  spawnedServer = null
  process.stdout.write(`[capture] tearing down examples server (pid=${child.pid})...\n`)
  // Send SIGTERM to the pnpm wrapper; vite is its child and exits with it.
  // If the tree doesn't exit within 5s, fall back to SIGKILL.
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

// Always tear down on signal / unhandled exit, so a Ctrl-C doesn't
// orphan the server and leave port 5174 stuck in TIME_WAIT.
const teardownAndExit = (code) => {
  teardownServer().finally(() => process.exit(code))
}
process.on('SIGINT', () => teardownAndExit(130))
process.on('SIGTERM', () => teardownAndExit(143))
process.on('uncaughtException', (err) => {
  console.error('[capture] uncaught exception:', err)
  teardownAndExit(1)
})

await ensureServer()
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true })

// ── Capture loop ───────────────────────────────────────────────────────

const browser = await chromium.launch({
  args: [
    // Allow large autoplay/MediaRecorder usage from a non-user-gesture context.
    '--autoplay-policy=no-user-gesture-required',
    // Ensure WebGL is enabled on whatever GPU is present.
    '--use-gl=angle',
    '--enable-features=Vulkan',
  ],
})

let totalOk = 0
let totalFail = 0

for (const { slug, path } of targets) {
  const url = `${BASE_URL}/${path}/`
  process.stdout.write(`[capture] ${slug.padEnd(14)} → ${url} `)

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    // Permissions are not strictly needed for canvas.captureStream + MediaRecorder
    // in chromium, but disabling autoplay restrictions via launch args matters.
  })
  const page = await ctx.newPage()

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 })

    // Wait for a canvas to mount.
    const canvas = page.locator('canvas').first()
    await canvas.waitFor({ state: 'attached', timeout: 15_000 })
    // Settle period — let R3F's first useFrame fire, sprites mount,
    // animation systems warm up, etc.
    await page.waitForTimeout(CANVAS_SETTLE_MS)

    // Hide the Tweakpane control panel before any frame is captured.
    // The panel renders into `.tp-dfwv` (tweakpane's standard wrapper,
    // appended to <body>) and otherwise intrudes on the captured frame
    // — breaks the masonry tile aesthetic where tiles should read as
    // pure scene posters. Belt + suspenders: [hidden] for semantics,
    // display:none for cases where global CSS overrides [hidden]. Done
    // here once so both the PNG/WEBP still and the WEBM recording come
    // out clean.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.tp-dfwv')) {
        el.setAttribute('hidden', '')
        el.style.display = 'none'
      }
    })

    // ─── Still (PNG + WEBP) ───────────────────────────────────
    // Read the canvas's pixel buffer directly via the Canvas API
    // in page context — NOT Playwright's locator.screenshot, which
    // captures the rendered region of the page including any DOM
    // that overlaps the canvas (dev overlay, vtbot scripts, etc).
    // `drawImage(canvas, 0, 0)` into a fresh 2D canvas reads the
    // source canvas's contents directly. Done inside
    // requestAnimationFrame so we read right after a frame draws —
    // works for r3f canvases without `preserveDrawingBuffer: true`.
    // Alpha preserved end-to-end (2D canvas + PNG natively support
    // alpha). Same mechanism as the video below (canvas.captureStream
    // also reads the buffer directly), so still and video are
    // identical content.
    const canvasPngBase64 = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          requestAnimationFrame(() => {
            try {
              const c = document.querySelector('canvas')
              if (!c) return reject(new Error('canvas missing at capture time'))
              const snap = document.createElement('canvas')
              snap.width = c.width
              snap.height = c.height
              const ctx = snap.getContext('2d')
              if (!ctx) return reject(new Error('2d context unavailable'))
              ctx.drawImage(c, 0, 0)
              snap.toBlob(async (blob) => {
                if (!blob) return reject(new Error('toBlob returned null'))
                const ab = await blob.arrayBuffer()
                const buf = new Uint8Array(ab)
                let bin = ''
                for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
                resolve(btoa(bin))
              }, 'image/png')
            } catch (e) {
              reject(e)
            }
          })
        }),
    )
    const pngBuffer = Buffer.from(/** @type {string} */ (canvasPngBase64), 'base64')
    const pngPath = resolve(OUT_DIR, `${slug}.png`)
    const webpPath = resolve(OUT_DIR, `${slug}.webp`)
    await writeFile(pngPath, pngBuffer)
    // Smooth radial gradients band hard at WEBP's default quality
    // (75) and even at 82 — the gem backdrop is mostly broad gradients
    // of similar luminance, exactly the worst case for chroma-
    // subsampled lossy. Bump to q=95 + smartSubsample so chroma stays
    // accurate across the gradient. alphaQuality: 100 keeps
    // transparent edges clean. File-size cost is small for these
    // 1280×800 stills (still typically < 100k).
    const webpBuffer = await sharp(pngBuffer)
      .webp({ quality: 95, smartSubsample: true, alphaQuality: 100 })
      .toBuffer()
    await writeFile(webpPath, webpBuffer)

    // ─── Video (WEBM via MediaRecorder + canvas.captureStream) ─
    const webmPath = resolve(OUT_DIR, `${slug}.webm`)
    const blobBytes = /** @type {string} */ (
      await page.evaluate(
        async ({ durationMs, fps }) => {
          const canvas = document.querySelector('canvas')
          if (!canvas) throw new Error('canvas missing at recording time')
          // Prefer VP9 (smaller, broadly supported); fall back to VP8.
          const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
          const mimeType = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
          const stream = canvas.captureStream(fps)
          // 12 Mbps — the gem backdrop's smooth radial gradient bands
          // visibly at lower bitrates (4 Mbps was OK for the prior
          // dark-flat backgrounds, not for broad smooth gradients).
          // 12 Mbps keeps the gradient banding-free while staying
          // reasonable for 6s clips at 1280×800.
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 })
          const chunks = /** @type {Blob[]} */ ([])
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data)
          }
          const stop = new Promise((res) => {
            recorder.onstop = () => res(undefined)
          })
          recorder.start(100)
          await new Promise((r) => setTimeout(r, durationMs))
          recorder.stop()
          await stop
          const blob = new Blob(chunks, { type: 'video/webm' })
          // Encode the Blob bytes as base64 so we can shuttle them
          // back to Node — Playwright's serialize doesn't carry Blob
          // contents directly across the bridge.
          const buf = new Uint8Array(await blob.arrayBuffer())
          // Chunked fromCharCode avoids the O(n) flatten that btoa(bin)
          // would do on a 9MB+ rope; risks Playwright's 30s timeout.
          const chunkSize = 65536
          const parts = []
          for (let i = 0; i < buf.length; i += chunkSize) {
            parts.push(String.fromCharCode(...buf.subarray(i, i + chunkSize)))
          }
          return btoa(parts.join(''))
        },
        { durationMs: VIDEO_DURATION_MS, fps: VIDEO_FPS }
      )
    )
    const webmBuffer = Buffer.from(blobBytes, 'base64')
    await writeFile(webmPath, webmBuffer)

    process.stdout.write(
      `✓ png ${(await fileSize(pngPath)).padStart(7)}  ` +
        `webp ${(await fileSize(webpPath)).padStart(7)}  ` +
        `webm ${(await fileSize(webmPath)).padStart(8)}\n`
    )
    totalOk++
  } catch (err) {
    process.stdout.write(`✗ ${(err && err.message) || err}\n`)
    totalFail++
  } finally {
    await ctx.close()
  }
}

await browser.close()

console.log(`\n[capture] done — ${totalOk} ok, ${totalFail} failed (out of ${targets.length}).`)
console.log(`[capture] output: ${OUT_DIR}`)

// Tear down the spawned examples server (no-op if we reused an
// existing one) before exiting so capture runs are self-contained
// and don't leak vite processes between invocations.
await teardownServer()
process.exit(totalFail === 0 ? 0 : 1)

async function fileSize(path) {
  const { stat } = await import('node:fs/promises')
  const s = await stat(path)
  const kb = s.size / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  return `${(kb / 1024).toFixed(2)}MB`
}
