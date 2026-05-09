import { webkit, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

let server = null
async function probe() { try { return (await fetch('http://localhost:4321/three-flatland/', { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
async function ensureServer() {
  if (await probe()) return
  server = spawn('pnpm', ['--filter=docs', 'dev'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TURBO_MFE_PORT: '4321' } })
  server.stdout.on('data', () => {}); server.stderr.on('data', () => {})
  const dl = Date.now() + 60000
  while (Date.now() < dl) { await new Promise(r => setTimeout(r, 500)); if (await probe()) return }
  process.exit(1)
}
async function teardown() { if (server) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 800)) } }
process.on('SIGINT', () => teardown().finally(() => process.exit(130)))
process.on('SIGTERM', () => teardown().finally(() => process.exit(143)))

await ensureServer()

async function inventory(name, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const counts = await page.evaluate(() => ({
    dataLight: document.querySelectorAll('[data-light], .u-light').length,
    dataHolo: document.querySelectorAll('[data-holo], .u-holo').length,
    dataReveal: document.querySelectorAll('[data-reveal], .u-reveal').length,
    featureCards: document.querySelectorAll('.feature-card').length,
    valueProps: document.querySelectorAll('.value-prop').length,
    statsItems: document.querySelectorAll('.stat-item').length,
  }))
  console.log(`[${name}] elements:`, JSON.stringify(counts))
  await ctx.close()
}

async function frameTest(name, browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    window.__perf = { frames: [], lastTs: 0 }
    const tick = (ts) => { if (window.__perf.lastTs) window.__perf.frames.push(ts - window.__perf.lastTs); window.__perf.lastTs = ts; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(4000)
  const r = await page.evaluate(() => {
    const f = window.__perf.frames; const s = [...f].sort((a, b) => a - b)
    return { frames: f.length, p50: s[Math.floor(s.length * 0.5)] || 0, p95: s[Math.floor(s.length * 0.95)] || 0, longest: s[s.length - 1] || 0, jankPct: f.length ? (f.filter(x => x > 16.67).length / f.length * 100).toFixed(1) : 0 }
  })
  console.log(`[${name}] frames=${r.frames} p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms longest=${r.longest.toFixed(1)}ms jank=${r.jankPct}%`)
  await ctx.close()
  return r
}

try {
  console.log('=== Inventory ===')
  const c = await chromium.launch()
  await inventory('chromium', c)
  await c.close()

  console.log('\n=== CHROMIUM perf ===')
  const ch = await chromium.launch()
  await frameTest('CH baseline (rmotion ON)', ch, { reducedMotion: true })
  await frameTest('CH idle motion-on', ch, {})
  await ch.close()

  console.log('\n=== WEBKIT perf ===')
  const wk = await webkit.launch()
  await frameTest('WK baseline (rmotion ON)', wk, { reducedMotion: true })
  await frameTest('WK idle motion-on', wk, {})
  await wk.close()
} finally { await teardown() }
