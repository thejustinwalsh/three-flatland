#!/usr/bin/env node
/**
 * Capture stills + short videos of every showcase / mini for the
 * showcases gallery. Same approach as `capture-examples.mjs` but
 * targeted at minis (showcase detail pages on the docs site itself,
 * not the standalone examples MFE).
 *
 * Outputs to:
 *
 *   docs/public/captures/<slug>.png    (poster still, full canvas)
 *   docs/public/captures/<slug>.webp   (poster, webp variant)
 *   docs/public/captures/<slug>.webm   (looping clip, ~6s)
 *
 * GalleryTile then loads the still as a poster and lazy-swaps the
 * webm in on hover. Same path/file convention as examples.
 *
 * Usage:
 *   pnpm --filter=docs capture:minis              # all minis
 *   pnpm --filter=docs capture:minis breakout
 *
 * The script self-spawns a docs dev server on port 4321 and tears it
 * down on exit (or Ctrl-C). If a server is already listening on that
 * port (e.g. the user's running `pnpm --filter=docs dev`) it reuses
 * the existing server.
 */
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

const PORT = 4321
const BASE_PATH = '/three-flatland'
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`

/** Inventory of showcase slugs that map 1:1 to
 *  `docs/src/content/docs/showcases/<slug>.mdx`. The `path` is the
 *  URL pathname (relative to BASE_URL) the script navigates to. */
const MINIS = [
  { slug: 'breakout', path: 'showcases/breakout' },
]

const VIDEO_DURATION_MS = 6_000
const VIDEO_FPS = 30
// Minis lazy-load (React.lazy + Suspense) AND the WebGPU context
// + flatland scene needs time to compile / mount / kick off attract-
// mode AI before rendering paints colored content. Bumped to 8s
// — at 5s the still occasionally hit a clear-without-draw frame
// while the video ran long enough to catch real gameplay frames,
// producing a poster that didn't match the video.
const CANVAS_SETTLE_MS = 8_000
const VIEWPORT = { width: 1280, height: 800 }
const OUT_DIR = resolve(__dirname, '..', 'public', 'captures')

// ── Helpers ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filter = args.length > 0 ? new Set(args) : null
const targets = filter ? MINIS.filter((m) => filter.has(m.slug)) : MINIS

if (targets.length === 0) {
  console.error(
    `[capture-minis] No matching minis for filter [${args.join(', ')}].\n` +
      `Available slugs: ${MINIS.map((m) => m.slug).join(', ')}`
  )
  process.exit(1)
}

const SERVER_READY_TIMEOUT_MS = 90_000
const SERVER_POLL_INTERVAL_MS = 750
let spawnedServer = null

async function probeServer() {
  // Probe a SPECIFIC showcase route, not just `/`. Generic 200 responses
  // from unrelated leftover servers (e.g. an orphaned `astro dev` on
  // a different project, a stray python http.server) used to trigger
  // false-positive reuse and cause silent hangs in chromium when the
  // page never resolved. Probing the actual nav target makes reuse
  // happen only against a real docs server with our routes mounted.
  const sample = MINIS[0]
  if (!sample) return false
  try {
    const res = await fetch(`${BASE_URL}/${sample.path}/`, {
      signal: AbortSignal.timeout(2_000),
      redirect: 'follow',
    })
    return res.ok
  } catch {
    return false
  }
}

async function ensureServer() {
  if (await probeServer()) {
    process.stdout.write(`[capture-minis] reusing existing server at ${BASE_URL}\n`)
    return
  }
  process.stdout.write(`[capture-minis] spawning docs dev server on ${PORT}...\n`)
  // Bypass the package's `dev` script (which depends on
  // `$TURBO_MFE_PORT`) and invoke astro directly with our explicit
  // port. Run from the workspace root so pnpm resolves the docs
  // package correctly.
  const child = spawn(
    'pnpm',
    ['--filter=docs', 'exec', 'astro', 'dev', '--port', String(PORT)],
    {
      cwd: resolve(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    },
  )
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
      console.error(`[capture-minis] docs server exited unexpectedly (code=${code} signal=${signal})`)
    }
    spawnedServer = null
  })
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS))
    if (await probeServer()) {
      process.stdout.write(`[capture-minis] server ready at ${BASE_URL}\n`)
      return
    }
  }
  await teardownServer()
  console.error(`[capture-minis] docs server did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`)
  process.exit(1)
}

async function teardownServer() {
  if (!spawnedServer) return
  const child = spawnedServer
  spawnedServer = null
  process.stdout.write(`[capture-minis] tearing down docs server (pid=${child.pid})...\n`)
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
  console.error('[capture-minis] uncaught exception:', err)
  teardownAndExit(1)
})

await ensureServer()
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true })

// ── Capture loop ───────────────────────────────────────────────────────

process.stdout.write(`[capture-minis] launching chromium...\n`)
const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle',
    '--enable-features=Vulkan',
  ],
})
process.stdout.write(`[capture-minis] chromium ready\n`)

let totalOk = 0
let totalFail = 0

for (const { slug, path } of targets) {
  const url = `${BASE_URL}/${path}/`
  process.stdout.write(`[capture-minis] ${slug.padEnd(12)} → ${url} `)

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()

  try {
    process.stdout.write(`\n[capture-minis]   navigating...`)
    // `domcontentloaded` (not `load`) — the docs site has lazy assets
    // that can keep the `load` event open for many seconds, and
    // React.lazy + Suspense components mount AFTER DOMContentLoaded
    // anyway. Waiting for `load` here just gives more wall-clock for
    // resources we don't care about (fonts, images) before we even
    // start watching for the canvas.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    process.stdout.write(` ok\n[capture-minis]   waiting for canvas...`)

    // The mini lazy-loads via React.lazy + Suspense — the canvas may
    // not be in the DOM at page-load. Wait for it to appear.
    const canvas = page.locator('.showcase-detail-stage canvas').first()
    await canvas.waitFor({ state: 'attached', timeout: 30_000 })
    process.stdout.write(` ok\n[capture-minis]   settling ${CANVAS_SETTLE_MS}ms...`)
    await page.waitForTimeout(CANVAS_SETTLE_MS)
    process.stdout.write(` ok\n[capture-minis]   capturing... `)

    // Hide any chrome that would intrude on the captured frame —
    // alpha ribbon (landing only, but defensive), tweakpane panel
    // (none on showcase detail today, defensive for future), and
    // the docs site's progress bar / loading indicator.
    await page.evaluate(() => {
      const hide = (sel) => {
        for (const el of document.querySelectorAll(sel)) {
          el.setAttribute('hidden', '')
          el.style.display = 'none'
        }
      }
      hide('.tp-dfwv')
      hide('.alpha-ribbon')
      hide('#tf-progress')
    })

    // ─── Still (PNG + WEBP) ───────────────────────────────────
    // Capture the canvas itself (matches the video, which is
    // sourced from canvas.captureStream). The canvas content is
    // what reads as the showcase preview — same source for poster
    // and clip means the two stay in visual sync.
    //
    // Force a paint synchronization: request two RAFs back-to-back
    // before the screenshot so the canvas's most recent draw has
    // been committed to the framebuffer. Without this the still
    // can land between a clear and a draw, capturing transparent
    // pixels that render as white in PNG viewers (which is what
    // user saw — the video had gem content but the still didn't).
    await page.evaluate(
      () =>
        new Promise((res) =>
          requestAnimationFrame(() => requestAnimationFrame(res)),
        ),
    )
    const pngPath = resolve(OUT_DIR, `${slug}.png`)
    const webpPath = resolve(OUT_DIR, `${slug}.webp`)
    const pngBuffer = await canvas.screenshot({ omitBackground: false })
    await writeFile(pngPath, pngBuffer)
    const webpBuffer = await sharp(pngBuffer)
      .webp({ quality: 95, smartSubsample: true })
      .toBuffer()
    await writeFile(webpPath, webpBuffer)

    // ─── Video (WEBM via MediaRecorder + canvas.captureStream) ─
    const webmPath = resolve(OUT_DIR, `${slug}.webm`)
    const blobBytes = /** @type {string} */ (
      await page.evaluate(
        async ({ durationMs, fps }) => {
          const c = document.querySelector('.showcase-detail-stage canvas')
          if (!c) throw new Error('canvas missing at recording time')
          const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
          const mimeType = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
          const stream = c.captureStream(fps)
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 })
          const chunks = []
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
          const buf = new Uint8Array(await blob.arrayBuffer())
          let bin = ''
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
          return btoa(bin)
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

console.log(`\n[capture-minis] done — ${totalOk} ok, ${totalFail} failed (out of ${targets.length}).`)
console.log(`[capture-minis] output: ${OUT_DIR}`)

await teardownServer()
process.exit(totalFail === 0 ? 0 : 1)

async function fileSize(path) {
  const { stat } = await import('node:fs/promises')
  const s = await stat(path)
  const kb = s.size / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  return `${(kb / 1024).toFixed(2)}MB`
}
