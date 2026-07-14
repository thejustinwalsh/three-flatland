// Text+icon benchmark harness: Slug (fork uikit) vs upstream uikit (MSDF text + mesh
// icons), rendering the SAME ladder scene (?scene=ladder) so the only variable is the
// rendering backend. Captures a per-frame TIME-SERIES (frame time + GPU-ms over a
// window → jitter) + summary stats + side-by-side ladder screenshots, at DPR 1x and 2x,
// plus one off-axis quality shot. NO recorded video (the live app is the shimmer test).
// Real GPU, non-headless. Needs the two ?scene=ladder apps serving (Slug :5241,
// upstream :5230). Run: `node bench/text-bench.mjs` then `node bench/text-report.mjs`.
import pw from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { chromium } = pw
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'text-shots')
mkdirSync(SHOTS, { recursive: true })

const SLUG = 'http://localhost:5241/react/uikit-perf/'
const MSDF = 'http://localhost:5230/'
const CELLS = [
  { key: 'slug-webgpu', label: 'Slug · WebGPU', tech: 'Slug', base: `${SLUG}?scene=ladder` },
  { key: 'slug-webgl2', label: 'Slug · WebGL2', tech: 'Slug', base: `${SLUG}?scene=ladder&renderer=webgl` },
  { key: 'uikit-msdf', label: 'uikit · WebGL (MSDF+mesh)', tech: 'uikit', base: `${MSDF}?scene=ladder` },
]
const DPRS = (process.env.DPRS ?? '1,2').split(',').map(Number) // 1x + HiDPI 2x, no 3x
const OFFAXIS = Number(process.env.OFFAXIS ?? 35) // matches the app's "Off-axis" nav link
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 30000) // 30s per cell for a true GPU/jitter sample
const WARM_MS = Number(process.env.WARM_MS ?? 5000) // warmup after load, BEFORE the sample window
const VIEWPORT = { width: 1500, height: 950 }

const url = (base, dpr, rotate) => `${base}&dpr=${dpr}${rotate ? `&rotate=${rotate}` : ''}`

const pct = (s, p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
function summarize(arr) {
  if (!arr || arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length
  const p50 = pct(s, 0.5)
  const p95 = pct(s, 0.95)
  return {
    avg: +mean.toFixed(2),
    p50: +p50.toFixed(2),
    p95: +p95.toFixed(2),
    p99: +pct(s, 0.99).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    jitter: +(p95 - p50).toFixed(2),
    stddev: +Math.sqrt(variance).toFixed(2),
  }
}

// In-page: sample for `ms`, one record per rAF frame (t since start, frame dt, GPU-ms).
const SAMPLER = async (ms) => {
  const t = []
  const frame = []
  const gpu = []
  const start = performance.now()
  let prev = start
  await new Promise((resolve) => {
    const tick = () => {
      const now = performance.now()
      t.push(+(now - start).toFixed(1))
      frame.push(now - prev)
      prev = now
      const g = window.__uikitPerf?.getState?.().gpuMs
      gpu.push(typeof g === 'number' ? g : 0)
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  const st = window.__uikitPerf?.getState?.() ?? {}
  return { t, frame, gpu, draws: st.render?.drawCalls ?? st.render?.calls ?? null, backend: st.backend ?? null }
}

async function open(browser, u, dpr) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: dpr })
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => window.__benchReady === true || window.__uikitPerf != null, { timeout: 40000 })
  await page.waitForTimeout(WARM_MS) // warmup: shader compile + JIT + thermal settle before sampling
  return page
}

const results = []
const shots = {}
const browser = await chromium.launch({ headless: false })
for (const cell of CELLS) {
  console.error(`\n[cell] ${cell.label}`)
  shots[cell.key] = { frontal: {} }
  try {
    for (const dpr of DPRS) {
      const page = await open(browser, url(cell.base, dpr, 0), dpr)
      const cap = await page.evaluate(SAMPLER, SAMPLE_MS)
      const frame = cap.frame.slice(3)
      const gpu = cap.gpu.slice(3)
      const f = `${cell.key}-dpr${dpr}-frontal.png`
      await page.screenshot({ path: join(SHOTS, f) })
      shots[cell.key].frontal[dpr] = f
      results.push({
        cell: cell.label, key: cell.key, tech: cell.tech, dpr, rotate: 0,
        draws: cap.draws, backend: cap.backend,
        frameMs: summarize(frame), gpuMs: summarize(gpu.filter((x) => x > 0)),
        series: { t: cap.t.slice(3), frame: frame.map((x) => +x.toFixed(2)), gpu: gpu.slice(3).map((x) => +x.toFixed(3)) },
      })
      const fm = results[results.length - 1].frameMs
      const gm = results[results.length - 1].gpuMs
      console.error(`  dpr${dpr} frontal  frame avg ${fm?.avg}/jit ${fm?.jitter}  gpu avg ${gm?.avg ?? 'n/a'}/p95 ${gm?.p95 ?? 'n/a'}  draws ${cap.draws}`)
      await page.close()
    }
    // Off-axis quality shot (dpr 2) — screenshot + short GPU read
    const dprHi = DPRS.includes(2) ? 2 : DPRS[DPRS.length - 1]
    const po = await open(browser, url(cell.base, dprHi, OFFAXIS), dprHi)
    const capO = await po.evaluate(SAMPLER, 3000)
    const of = `${cell.key}-dpr${dprHi}-offaxis.png`
    await po.screenshot({ path: join(SHOTS, of) })
    shots[cell.key].offaxis = of
    shots[cell.key].offaxisDpr = dprHi
    results.push({ cell: cell.label, key: cell.key, tech: cell.tech, dpr: dprHi, rotate: OFFAXIS, gpuMs: summarize(capO.gpu.slice(3).filter((x) => x > 0)) })
    console.error(`  dpr${dprHi} off-axis(${OFFAXIS}°) captured`)
    await po.close()
  } catch (err) {
    console.error(`  !! ${cell.label} failed: ${String(err).slice(0, 160)}`)
    results.push({ cell: cell.label, key: cell.key, error: String(err).slice(0, 300) })
  }
}
await browser.close()

writeFileSync(
  join(HERE, 'text-results.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), dprs: DPRS, offaxis: OFFAXIS, sampleMs: SAMPLE_MS, cells: CELLS.map((c) => c.label), results, shots })
)
console.error(`\nwrote ${join(HERE, 'text-results.json')}`)
