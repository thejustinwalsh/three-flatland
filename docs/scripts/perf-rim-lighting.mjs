#!/usr/bin/env node
/**
 * Safari (Webkit) performance probe for the rim-lighting card effects.
 *
 * Boots the docs preview server, navigates to the landing page (worst-
 * case rim-lighting density: FeatureCard grid + ValueProp + LinkButton +
 * StatsBanner), then runs two scenarios in Webkit:
 *
 *   1. Idle: page sits, no cursor activity → measures ambient cost of
 *      the rAF loop driving --scene-* + per-target --mx/--my/etc.
 *   2. Active: synthetic pointermove sweep across cards for 4 seconds →
 *      measures full cursor-light + tilt + foil-rim repaint cost.
 *
 * Compares against a baseline with prefers-reduced-motion forced on
 * (which short-circuits the motion loop).
 *
 * Output:
 *   - frames captured (target 60fps × test duration)
 *   - % of frames over 16.67ms budget (jank %)
 *   - longest frame (ms)
 *   - Long-Task count (>50ms, blocking)
 */
import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`
const PATH = '/three-flatland/'  // landing page = worst case

let spawnedServer = null
async function probeServer() {
  try {
    const res = await fetch(`${BASE_URL}${PATH}`, { signal: AbortSignal.timeout(2_000) })
    return res.ok
  } catch { return false }
}

async function ensureServer() {
  if (await probeServer()) {
    process.stdout.write(`[perf] reusing server at ${BASE_URL}\n`)
    return
  }
  process.stdout.write(`[perf] spawning docs dev server on ${PORT}...\n`)
  const child = spawn('pnpm', ['--filter=docs', 'dev'], {
    cwd: resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TURBO_MFE_PORT: String(PORT) },
  })
  spawnedServer = child
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500))
    if (await probeServer()) {
      process.stdout.write(`[perf] server ready\n`)
      return
    }
  }
  console.error(`[perf] server didn't come up`)
  process.exit(1)
}

async function teardownServer() {
  if (!spawnedServer) return
  spawnedServer.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 1000))
  spawnedServer = null
}
process.on('SIGINT', () => { teardownServer().finally(() => process.exit(130)) })
process.on('SIGTERM', () => { teardownServer().finally(() => process.exit(143)) })

await ensureServer()

const browser = await webkit.launch()
console.log(`[perf] webkit: ${await browser.version()}`)

async function captureScenario(name, { reducedMotion = false, mouseActive = false }) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}${PATH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)  // settle: fonts, hydration, motion warm-up

  // Inject perf observer + frame counter
  await page.evaluate(() => {
    window.__perf = {
      frames: [],
      longTasks: 0,
      paintCount: 0,
      lastTs: 0,
    }
    const tick = (ts) => {
      const last = window.__perf.lastTs
      if (last) window.__perf.frames.push(ts - last)
      window.__perf.lastTs = ts
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration > 50) window.__perf.longTasks++
          if (e.entryType === 'paint') window.__perf.paintCount++
        }
      })
      po.observe({ entryTypes: ['longtask'] })
    } catch {}
  })

  if (mouseActive) {
    // Synthetic pointermove sweep across the FeatureCard grid for 4s.
    // 60Hz target = ~240 events.
    const card = page.locator('.feature-card').first()
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    if (box) {
      const t0 = Date.now()
      let i = 0
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

  const result = await page.evaluate(() => {
    const f = window.__perf.frames
    const sorted = [...f].sort((a, b) => a - b)
    return {
      frames: f.length,
      longestMs: sorted[sorted.length - 1] || 0,
      p50Ms: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      jankPct: f.length ? (f.filter(x => x > 16.67).length / f.length * 100).toFixed(1) : 0,
      stutterPct: f.length ? (f.filter(x => x > 33.3).length / f.length * 100).toFixed(1) : 0,
      longTasks: window.__perf.longTasks,
    }
  })
  await ctx.close()

  console.log(`\n[${name}]`)
  console.log(`  frames captured:   ${result.frames}`)
  console.log(`  p50 / p95 / p99:   ${result.p50Ms.toFixed(2)} / ${result.p95Ms.toFixed(2)} / ${result.p99Ms.toFixed(2)} ms`)
  console.log(`  longest frame:     ${result.longestMs.toFixed(2)} ms`)
  console.log(`  >16.67ms (jank):   ${result.jankPct}%`)
  console.log(`  >33.3ms (stutter): ${result.stutterPct}%`)
  console.log(`  long tasks (>50):  ${result.longTasks}`)
  return result
}

try {
  console.log(`\n=== SAFARI (Webkit) RIM-LIGHTING PERF PROBE ===`)
  console.log(`URL: ${BASE_URL}${PATH}`)
  console.log(`Viewport: 1440×900 @ 2x`)

  const baseline = await captureScenario('baseline (reduced motion ON, no cursor)', {
    reducedMotion: true, mouseActive: false,
  })
  const idle = await captureScenario('idle (motion ON, no cursor)', {
    reducedMotion: false, mouseActive: false,
  })
  const active = await captureScenario('ACTIVE (motion ON + cursor sweep)', {
    reducedMotion: false, mouseActive: true,
  })

  console.log(`\n=== DELTAS ===`)
  console.log(`  motion-on cost (idle vs baseline):     +${(idle.p95Ms - baseline.p95Ms).toFixed(2)}ms p95`)
  console.log(`  cursor-sweep cost (active vs idle):   +${(active.p95Ms - idle.p95Ms).toFixed(2)}ms p95`)
  console.log(`  full motion cost (active vs baseline): +${(active.p95Ms - baseline.p95Ms).toFixed(2)}ms p95`)
  console.log(`  jank under load:                       ${active.jankPct}%`)
} finally {
  await browser.close()
  await teardownServer()
}
