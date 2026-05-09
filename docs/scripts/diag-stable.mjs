import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const PORT = 4322
const URL = `http://localhost:${PORT}/three-flatland/examples/`

let server = null
async function probe() { try { return (await fetch(URL, { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
async function ensureServer() {
  if (await probe()) { console.log('reusing'); return }
  console.log('spawning astro preview')
  server = spawn('pnpm', ['exec', 'astro', 'preview', '--port', String(PORT)], {
    cwd: resolve(import.meta.dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (d) => {})
  server.stderr.on('data', (d) => {})
  const dl = Date.now() + 30000
  while (Date.now() < dl) { await new Promise(r => setTimeout(r, 400)); if (await probe()) { console.log('ready'); return } }
  process.exit(1)
}
async function teardown() { if (server) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 800)) } }
process.on('SIGINT', () => teardown().finally(() => process.exit(130)))

await ensureServer()
const browser = await webkit.launch()

async function once() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.evaluate(() => {
    window.__perf = { frames: [], lastTs: 0 }
    const tick = (ts) => { if (window.__perf.lastTs) window.__perf.frames.push(ts - window.__perf.lastTs); window.__perf.lastTs = ts; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(5000)
  const r = await page.evaluate(() => {
    const f = window.__perf.frames; const s = [...f].sort((a, b) => a - b)
    return { frames: f.length, p50: s[Math.floor(s.length * 0.5)] || 0, p95: s[Math.floor(s.length * 0.95)] || 0, stutterPct: f.length ? +(f.filter(x => x > 33.3).length / f.length * 100).toFixed(1) : 0 }
  })
  await ctx.close()
  return r
}

try {
  console.log(`\nExamples page (production preview), Webkit, 3 runs:`)
  for (let i = 1; i <= 3; i++) {
    const r = await once()
    console.log(`  run ${i}: frames=${r.frames}/300 p50=${r.p50.toFixed(0)}ms p95=${r.p95.toFixed(0)}ms stutter=${r.stutterPct}%`)
  }
} finally { await browser.close(); await teardown() }
