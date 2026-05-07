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
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function ensureServer() {
  try {
    const res = await fetch(`${BASE_URL}/three/basic-sprite/`)
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch (err) {
    console.error(
      `[capture] examples dev server not reachable at ${BASE_URL}.\n` +
        `Start it with \`pnpm --filter=examples dev\` (or root \`pnpm dev\`),\n` +
        `then re-run this script.`
    )
    console.error(`         underlying error: ${(err && err.message) || err}`)
    process.exit(1)
  }
}

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

    // ─── Still (PNG) ──────────────────────────────────────────
    const pngPath = resolve(OUT_DIR, `${slug}.png`)
    await canvas.screenshot({ path: pngPath, omitBackground: false })

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
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
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
          let bin = ''
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
          return btoa(bin)
        },
        { durationMs: VIDEO_DURATION_MS, fps: VIDEO_FPS }
      )
    )
    const webmBuffer = Buffer.from(blobBytes, 'base64')
    await writeFile(webmPath, webmBuffer)

    process.stdout.write(`✓ png ${(await fileSize(pngPath)).padStart(7)}  webm ${(await fileSize(webmPath)).padStart(8)}\n`)
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
process.exit(totalFail === 0 ? 0 : 1)

async function fileSize(path) {
  const { stat } = await import('node:fs/promises')
  const s = await stat(path)
  const kb = s.size / 1024
  if (kb < 1024) return `${kb.toFixed(1)}KB`
  return `${(kb / 1024).toFixed(2)}MB`
}
