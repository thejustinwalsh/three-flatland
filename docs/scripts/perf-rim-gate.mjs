#!/usr/bin/env node
/**
 * Per-fix gating harness for the Safari rim-lighting perf workstream.
 *
 * For each measurement run:
 *   1. Capture Webkit perf — idle + active scenarios — same as
 *      perf-rim-lighting.mjs.
 *   2. Capture two visual-regression screenshots in Webkit at a
 *      deterministic motion state: a CSS override pins
 *      --mx/--my/--mouse-active/--scene-angle/--effective-light-angle
 *      to fixed values BEFORE the motion script can write them. This
 *      makes the captured frame reproducible enough for a meaningful
 *      pixel diff (the rAF loop is short-circuited because the
 *      override forces !important values that the loop's writes can't
 *      win against).
 *
 * Outputs to /tmp/perf-runs/<label>/{idle.json,active.json,locked-card.png,locked-vp.png}.
 *
 * Usage:
 *   node scripts/perf-rim-gate.mjs <label>
 *
 * The `<label>` is the run name (e.g. "before-fix-1", "after-fix-1").
 * Run twice (before / after the fix) and compare.
 */
import { webkit } from '@playwright/test'
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
if (!label) {
  console.error('usage: node scripts/perf-rim-gate.mjs <label>')
  process.exit(1)
}

const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`
const PATH = '/three-flatland/'
const OUT_DIR = `/tmp/perf-runs/${label}`

let server = null
async function probe() {
  try {
    return (await fetch(`${BASE_URL}${PATH}`, { signal: AbortSignal.timeout(2000) })).ok
  } catch { return false }
}
async function ensureServer() {
  if (await probe()) { console.log(`[gate:${label}] reusing server`); return }
  console.log(`[gate:${label}] spawning docs dev server`)
  server = spawn('pnpm', ['--filter=docs', 'dev'], {
    cwd: resolve(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TURBO_MFE_PORT: String(PORT) },
  })
  server.stdout.on('data', () => {}); server.stderr.on('data', () => {})
  const dl = Date.now() + 60000
  while (Date.now() < dl) {
    await new Promise(r => setTimeout(r, 500))
    if (await probe()) { console.log(`[gate:${label}] server ready`); return }
  }
  process.exit(1)
}
async function teardown() {
  if (!server) return
  server.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 800))
}
process.on('SIGINT', () => teardown().finally(() => process.exit(130)))
process.on('SIGTERM', () => teardown().finally(() => process.exit(143)))

await mkdir(OUT_DIR, { recursive: true })
await ensureServer()

const browser = await webkit.launch()
console.log(`[gate:${label}] webkit ${await browser.version()}`)

async function frameTest(scenario, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}${PATH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    window.__perf = { frames: [], lastTs: 0 }
    const tick = (ts) => {
      if (window.__perf.lastTs) window.__perf.frames.push(ts - window.__perf.lastTs)
      window.__perf.lastTs = ts
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  if (opts.mouseActive) {
    const card = page.locator('.feature-card').first()
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    if (box) {
      const t0 = Date.now(); let i = 0
      while (Date.now() - t0 < 4000) {
        const dx = box.x + box.width * (0.2 + 0.6 * (Math.sin(i * 0.1) * 0.5 + 0.5))
        const dy = box.y + box.height * (0.2 + 0.6 * (Math.cos(i * 0.13) * 0.5 + 0.5))
        await page.mouse.move(dx, dy, { steps: 1 })
        await page.waitForTimeout(16)
        i++
      }
    }
  } else {
    await page.waitForTimeout(4000)
  }

  const r = await page.evaluate(() => {
    const f = window.__perf.frames
    const s = [...f].sort((a, b) => a - b)
    return {
      frames: f.length,
      p50: s[Math.floor(s.length * 0.5)] || 0,
      p95: s[Math.floor(s.length * 0.95)] || 0,
      longest: s[s.length - 1] || 0,
      jankPct: f.length ? +(f.filter(x => x > 16.67).length / f.length * 100).toFixed(1) : 0,
      stutterPct: f.length ? +(f.filter(x => x > 33.3).length / f.length * 100).toFixed(1) : 0,
    }
  })
  await ctx.close()
  return r
}

async function visualLock(target) {
  // Capture a screenshot at a DETERMINISTIC motion state: inject CSS
  // that pins all motion vars with !important so the rAF loop's writes
  // can't override them. Same lock applied before AND after the fix
  // means any pixel difference is from the fix's actual visual effect,
  // not loop timing variance.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}${PATH}`, { waitUntil: 'domcontentloaded' })

  // Inject lock as early as possible.
  await page.addStyleTag({
    content: `
      :root {
        --scene-angle: 90deg !important;
        --effective-light-angle: 90deg !important;
      }
      [data-light], .u-light, .feature-card, .value-prop {
        --mx: 35% !important;
        --my: 30% !important;
        --mouse-active: 1 !important;
        --light-angle: 60deg !important;
        --tilt-x: 0deg !important;
        --tilt-y: 0deg !important;
      }
    `,
  })
  await page.waitForTimeout(2500)

  const buf = await page.locator(target.selector).first().screenshot({ type: 'png' })
  await writeFile(join(OUT_DIR, target.file), buf)
  console.log(`[gate:${label}] wrote ${target.file} (${(buf.length / 1024).toFixed(0)}k)`)
  await ctx.close()
}

try {
  console.log(`[gate:${label}] === FRAME TIMING ===`)
  const baseline = await frameTest('baseline-rmotion-on', { reducedMotion: true, mouseActive: false })
  const idle = await frameTest('idle-motion-on', { reducedMotion: false, mouseActive: false })
  const active = await frameTest('active-cursor-sweep', { reducedMotion: false, mouseActive: true })

  await writeFile(join(OUT_DIR, 'frames.json'), JSON.stringify({ baseline, idle, active }, null, 2))
  console.log(`[gate:${label}] baseline:  p50=${baseline.p50.toFixed(1)}ms p95=${baseline.p95.toFixed(1)}ms jank=${baseline.jankPct}%`)
  console.log(`[gate:${label}] idle:      p50=${idle.p50.toFixed(1)}ms p95=${idle.p95.toFixed(1)}ms jank=${idle.jankPct}%`)
  console.log(`[gate:${label}] active:    p50=${active.p50.toFixed(1)}ms p95=${active.p95.toFixed(1)}ms jank=${active.jankPct}%`)

  console.log(`[gate:${label}] === VISUAL LOCK ===`)
  await visualLock({ selector: '.feature-card', file: 'locked-card.png' })
  await visualLock({ selector: '.value-prop', file: 'locked-vp.png' })

  console.log(`[gate:${label}] artifacts in ${OUT_DIR}`)
} finally {
  await browser.close()
  await teardown()
}
