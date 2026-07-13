// uikit render benchmark runner. Real-GPU (non-headless Playwright on this machine — NOT for CI),
// sweeps each cell x preset x mode and captures EVERY metric: frame time (p50/p95/mean/max/jitter/
// stddev), GPU time (p50/p95), draw calls, scene objects, textures, geometries, backend. Writes
// bench/results.json for report.mjs. Run: `pnpm --filter=example-react-uikit-perf bench`.
//
// CELLS is the whole comparison surface — add a cell by pointing a label at a running dev server.
// The fork bench (this example) serves WebGPU at `/` and forced-WebGL2 at `?renderer=webgl`. Point an
// upstream/MSDF cell at its own dev server. Servers must already be running (the runner does not start
// them). Override the sweep with env: LEVELS, MODES, FRAMES, SETTLE_MS, WARM_MS.
import pw from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { chromium } = pw
const HERE = dirname(fileURLToPath(import.meta.url))

// Two workloads, each with a WebGPU + a forced-WebGL2 cell:
//  - Perf Lab: a sweepable stress scene (presets x modes), shared baked Slug font.
//  - Bento: the FIXED product showcase (packages/uikit/example), baked Slug font.
// `fixed: true` marks the bento's single-state scene — the runner measures it once
// instead of driving the (no-op) sweep hooks. Point `bentoUrl` at the bento's own
// dev server. Upstream (WebGL-only, MSDF) is the ceiling reference for the lab.
const LAB = process.env.LAB_URL ?? 'http://localhost:5241/react/uikit-perf/'
const BENTO = process.env.BENTO_URL ?? 'http://localhost:5240/'
const CELLS = [
  { label: 'lab · fork · WebGPU · Slug', url: LAB },
  { label: 'lab · fork · WebGL2 · Slug', url: `${LAB}?renderer=webgl` },
  { label: 'lab · upstream · WebGL · MSDF', url: 'http://localhost:5230/' },
  { label: 'bento · fork · WebGPU · Slug', url: BENTO, fixed: true },
  { label: 'bento · fork · WebGL2 · Slug', url: `${BENTO}?renderer=webgl`, fixed: true },
]

// Levels index the scene's presets (0=Desk 192 … 8=Crush 98304). Default caps at 6 (24,576) — the
// two extreme presets reliably OOM/crash an automated browser tab. Raise LEVELS at your own risk.
const LEVELS = (process.env.LEVELS ?? '3,4,5,6').split(',').map(Number)
const MODES = (process.env.MODES ?? 'cards,decorated,sampled').split(',')
const FRAMES = Number(process.env.FRAMES ?? 160)
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3000)
const WARM_MS = Number(process.env.WARM_MS ?? 2500)

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
function summarize(arr) {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length
  const p50 = pct(s, 0.5)
  const p95 = pct(s, 0.95)
  return {
    p50: +p50.toFixed(2),
    p95: +p95.toFixed(2),
    mean: +mean.toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    jitter: +(p95 - p50).toFixed(2),
    stddev: +Math.sqrt(variance).toFixed(2),
  }
}

async function measureCell(browser, cell) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(cell.url, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => window.__uikitPerf != null, { timeout: 40000 })
  await page.waitForTimeout(WARM_MS)

  // Capture FRAMES rAF frames: per-frame times + a GPU-ms sample per frame, then a
  // final state snapshot (draws/textures/geometries/backend). Prefer three's real
  // `drawCalls`; `calls` is the legacy fallback.
  const capture = () =>
    page.evaluate(async (frames) => {
      const frameMs = []
      const gpuMs = []
      let prev = performance.now()
      await new Promise((resolve) => {
        let i = 0
        const tick = () => {
          const now = performance.now()
          frameMs.push(now - prev)
          prev = now
          const g = window.__uikitPerf.getState().gpuMs
          if (typeof g === 'number' && g > 0) gpuMs.push(g)
          if (++i < frames) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      const st = window.__uikitPerf.getState()
      return {
        frameMs: frameMs.slice(3),
        gpuMs,
        items: st.items,
        backend: st.backend,
        objects: st.objects,
        drawCalls: st.render?.drawCalls ?? st.render?.calls ?? null,
        textures: st.memory?.textures ?? null,
        geometries: st.memory?.geometries ?? null,
      }
    }, FRAMES)

  // A fixed scene (bento) is measured once; a sweepable scene (lab) runs modes x levels.
  const steps = cell.fixed
    ? [{ mode: 'fixed', level: 0 }]
    : MODES.flatMap((mode) => LEVELS.map((level) => ({ mode, level })))

  const rows = []
  for (const { mode, level } of steps) {
    if (!cell.fixed) {
      await page.evaluate(([l, m]) => window.__uikitPerf.setComplexity(l, m), [level, mode])
    }
    await page.waitForTimeout(SETTLE_MS)
    const cap = await capture()
    const row = {
      cell: cell.label,
      mode,
      level,
      items: cap.items,
      backend: cap.backend,
      objects: cap.objects,
      drawCalls: cap.drawCalls,
      textures: cap.textures,
      geometries: cap.geometries,
      frameMs: summarize(cap.frameMs),
      gpuMs: summarize(cap.gpuMs),
    }
    rows.push(row)
    console.error(
      `  ${cell.label.padEnd(28)} ${mode.padEnd(6)} L${level} items=${String(cap.items).padStart(5)} ` +
        `frame ${row.frameMs?.p50}/${row.frameMs?.p95}ms jit ${row.frameMs?.jitter} ` +
        `gpu ${row.gpuMs?.p50 ?? 'n/a'}ms draws ${cap.drawCalls} tex ${cap.textures}`
    )
  }
  await page.close()
  return rows
}

const results = []
for (const cell of CELLS) {
  console.error(`\n[cell] ${cell.label}  (${cell.url})`)
  let browser
  try {
    browser = await chromium.launch({ headless: false })
    const rows = await measureCell(browser, cell)
    results.push(...rows)
  } catch (err) {
    console.error(`  !! ${cell.label} failed: ${String(err).slice(0, 160)}`)
    results.push({ cell: cell.label, error: String(err).slice(0, 300) })
  } finally {
    await browser?.close().catch(() => {})
  }
}

mkdirSync(HERE, { recursive: true })
const payload = {
  ranAt: new Date().toISOString(),
  sweep: { levels: LEVELS, modes: MODES, frames: FRAMES, settleMs: SETTLE_MS },
  cells: CELLS.map((c) => c.label),
  results,
}
writeFileSync(join(HERE, 'results.json'), JSON.stringify(payload, null, 2))
console.error(`\nwrote ${join(HERE, 'results.json')} (${results.length} rows)`)
