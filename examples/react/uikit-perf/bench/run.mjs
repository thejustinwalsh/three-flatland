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

const CELLS = [
  { label: 'fork · WebGPU · Slug', url: 'http://localhost:5218/react/uikit-perf/' },
  { label: 'fork · WebGL2 · Slug', url: 'http://localhost:5218/react/uikit-perf/?renderer=webgl' },
  { label: 'upstream · WebGL · MSDF', url: 'http://localhost:5230/' },
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
  const rows = []
  for (const mode of MODES) {
    for (const level of LEVELS) {
      await page.evaluate(([l, m]) => window.__uikitPerf.setComplexity(l, m), [level, mode])
      await page.waitForTimeout(SETTLE_MS)
      const cap = await page.evaluate(async (frames) => {
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
          drawCalls: st.render?.calls ?? null,
          textures: st.memory?.textures ?? null,
          geometries: st.memory?.geometries ?? null,
        }
      }, FRAMES)
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
        `  ${cell.label.padEnd(24)} ${mode.padEnd(9)} L${level} items=${String(cap.items).padStart(5)} ` +
          `frame ${row.frameMs?.p50}/${row.frameMs?.p95}ms jit ${row.frameMs?.jitter} ` +
          `gpu ${row.gpuMs?.p50 ?? 'n/a'}ms draws ${cap.drawCalls} tex ${cap.textures}`
      )
    }
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
