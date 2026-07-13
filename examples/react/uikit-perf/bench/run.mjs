// uikit render benchmark runner. Real-GPU (non-headless Playwright on this machine —
// NOT for CI). For each cell x mode x level it takes a SAMPLE_MS time-series (one
// record per rAF frame: wall-clock frame time + GPU-ms), computes avg/p50/p95/p99/
// max/jitter/stddev, AND (once per cell) captures a CDP DevTools performance trace at
// a focus workload so you can open the Performance panel and see what the GPU is
// doing. Writes bench/results.json (+ bench/traces/*.json) for report.mjs.
// Run: `pnpm --filter=example-react-uikit-perf bench`.
//
// The comparison surface (edit CELLS to add more). Every cell exposes
// window.__uikitPerf.getState() -> { items, backend, render, memory, gpuMs }. GPU-ms:
// fork WebGPU = TimestampQuery; fork WebGL2 = EXT_disjoint_timer_query (via three);
// upstream MSDF = EXT_disjoint_timer_query driven manually in the app. So Slug and MSDF
// GPU cost are measured through the same WebGL2 extension — apples-to-apples.
// Env overrides: LEVELS, MODES, SAMPLE_MS, SETTLE_MS, WARM_MS, TRACE(=0 off), TRACE_MS,
// TRACE_MODE, TRACE_LEVEL, LAB_URL, BENTO_URL.
import pw from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { chromium } = pw
const HERE = dirname(fileURLToPath(import.meta.url))
const TRACES = join(HERE, 'traces')
const SHOTS = join(HERE, 'shots')

const LAB = process.env.LAB_URL ?? 'http://localhost:5241/react/uikit-perf/'
const BENTO = process.env.BENTO_URL ?? 'http://localhost:5173/'
const CELLS = [
  { label: 'lab · fork · WebGPU · Slug', url: LAB, kind: 'lab', tech: 'Slug' },
  { label: 'lab · fork · WebGL2 · Slug', url: `${LAB}?renderer=webgl`, kind: 'lab', tech: 'Slug' },
  { label: 'lab · upstream · WebGL2 · MSDF', url: 'http://localhost:5230/', kind: 'lab', tech: 'MSDF' },
  { label: 'bento · fork · WebGPU · Slug', url: BENTO, kind: 'bento', tech: 'Slug', fixed: true },
  { label: 'bento · fork · WebGL2 · Slug', url: `${BENTO}?renderer=webgl`, kind: 'bento', tech: 'Slug', fixed: true },
]

const LEVELS = (process.env.LEVELS ?? '5').split(',').map(Number)
const MODES = (process.env.MODES ?? 'cards,decorated,sampled').split(',')
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 30000)
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3000)
const WARM_MS = Number(process.env.WARM_MS ?? 2500)
const TRACE = process.env.TRACE !== '0'
const TRACE_MS = Number(process.env.TRACE_MS ?? 10000)
const TRACE_MODE = process.env.TRACE_MODE ?? (MODES.includes('decorated') ? 'decorated' : MODES[0])
const TRACE_LEVEL = Number(process.env.TRACE_LEVEL ?? Math.max(...LEVELS))

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
function summarize(arr) {
  if (!arr || arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mean = s.reduce((a, b) => a + b, 0) / s.length
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length
  const p50 = pct(s, 0.5)
  const p95 = pct(s, 0.95)
  const p99 = pct(s, 0.99)
  return {
    n: s.length,
    avg: +mean.toFixed(2),
    p50: +p50.toFixed(2),
    p95: +p95.toFixed(2),
    p99: +p99.toFixed(2),
    min: +s[0].toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    jitter: +(p95 - p50).toFixed(2),
    stddev: +Math.sqrt(variance).toFixed(2),
  }
}

// In-page: sample for `ms` ms, one record per rAF frame (t since start, frame dt, GPU-ms).
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
      const g = window.__uikitPerf.getState().gpuMs
      gpu.push(typeof g === 'number' ? g : 0)
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  const st = window.__uikitPerf.getState()
  return {
    t,
    frame,
    gpu,
    items: st.items,
    backend: st.backend,
    objects: st.objects ?? null,
    drawCalls: st.render?.drawCalls ?? st.render?.calls ?? null,
    textures: st.memory?.textures ?? null,
    geometries: st.memory?.geometries ?? null,
  }
}

// CDP DevTools trace (Performance-panel loadable). Categories mirror what DevTools
// records, incl. the GPU track, so you can see per-frame GPU work for each cell.
async function captureTrace(page, label) {
  const client = await page.context().newCDPSession(page)
  const events = []
  client.on('Tracing.dataCollected', (e) => {
    for (const ev of e.value) events.push(ev)
  })
  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      recordMode: 'recordAsMuchAsPossible',
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-devtools.timeline.stack',
        'v8.execute',
        'disabled-by-default-v8.cpu_profiler',
        'blink.user_timing',
        'latencyInfo',
        'gpu',
        'disabled-by-default-gpu.service',
        'toplevel',
      ],
    },
  })
  await page.waitForTimeout(TRACE_MS)
  await new Promise((resolve) => {
    client.once('Tracing.tracingComplete', resolve)
    client.send('Tracing.end')
  })
  await client.detach().catch(() => {})
  const name = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json'
  writeFileSync(join(TRACES, name), JSON.stringify({ traceEvents: events, metadata: { source: label } }))
  return { name, events: events.length }
}

async function measureCell(browser, cell) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(cell.url, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => window.__uikitPerf != null, { timeout: 40000 })
  await page.waitForTimeout(WARM_MS)

  // Fixed scene (bento) is measured once; a sweepable scene (lab) runs modes x levels.
  const steps = cell.fixed
    ? [{ mode: 'fixed', level: 0 }]
    : MODES.flatMap((mode) => LEVELS.map((level) => ({ mode, level })))

  const rows = []
  for (const { mode, level } of steps) {
    if (!cell.fixed) {
      await page.evaluate(([l, m]) => window.__uikitPerf.setComplexity(l, m), [level, mode])
    }
    await page.waitForTimeout(SETTLE_MS)
    const cap = await page.evaluate(SAMPLER, SAMPLE_MS)
    // Drop the first 3 frames (post-setComplexity reflow spike) before stats.
    const t = cap.t.slice(3)
    const frame = cap.frame.slice(3)
    const gpuAll = cap.gpu.slice(3)
    const gpu = gpuAll.filter((x) => x > 0)
    const row = {
      cell: cell.label,
      kind: cell.kind,
      tech: cell.tech,
      mode,
      level,
      items: cap.items,
      backend: cap.backend,
      objects: cap.objects,
      drawCalls: cap.drawCalls,
      textures: cap.textures,
      geometries: cap.geometries,
      frameMs: summarize(frame),
      gpuMs: summarize(gpu),
      series: {
        t,
        frame: frame.map((x) => +x.toFixed(2)),
        gpu: gpuAll.map((x) => +x.toFixed(3)),
      },
    }
    rows.push(row)
    console.error(
      `  ${cell.label.padEnd(30)} ${mode.padEnd(6)} L${level} items=${String(cap.items).padStart(5)} ` +
        `frame avg ${row.frameMs?.avg}/p95 ${row.frameMs?.p95}/p99 ${row.frameMs?.p99} jit ${row.frameMs?.jitter} ` +
        `gpu avg ${row.gpuMs?.avg ?? 'n/a'}/p95 ${row.gpuMs?.p95 ?? 'n/a'} draws ${cap.drawCalls}`
    )
  }

  // One DevTools trace per cell at the focus workload (the like-for-like GPU deep-dive).
  let trace = null
  if (TRACE) {
    try {
      if (!cell.fixed) {
        await page.evaluate(([l, m]) => window.__uikitPerf.setComplexity(l, m), [TRACE_LEVEL, TRACE_MODE])
        await page.waitForTimeout(SETTLE_MS)
      }
      const r = await captureTrace(page, cell.label)
      trace = {
        cell: cell.label,
        file: `traces/${r.name}`,
        events: r.events,
        mode: cell.fixed ? 'fixed' : TRACE_MODE,
        level: cell.fixed ? 0 : TRACE_LEVEL,
      }
      console.error(`  ${cell.label.padEnd(30)} trace -> ${trace.file} (${r.events} events)`)
    } catch (err) {
      console.error(`  ${cell.label.padEnd(30)} trace FAILED: ${String(err).slice(0, 140)}`)
    }
  }

  // Font-quality screenshots at the focus workload. Lab and upstream share the same
  // scene layout, so the heading crop is the SAME text at the SAME size — a true
  // like-for-like Slug-vs-MSDF quality comparison. Also a full frame for context.
  let shot = null
  try {
    if (!cell.fixed) {
      await page.evaluate(([l, m]) => window.__uikitPerf.setComplexity(l, m), [TRACE_LEVEL, TRACE_MODE])
      await page.waitForTimeout(1200)
    }
    const name = cell.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png'
    writeFileSync(join(SHOTS, name), await page.screenshot())
    const clip = cell.fixed
      ? { x: 24, y: 24, width: 700, height: 130 }
      : { x: 44, y: 40, width: 640, height: 92 }
    const headingBuf = await page.screenshot({ clip })
    shot = { cell: cell.label, tech: cell.tech, heading: 'data:image/png;base64,' + headingBuf.toString('base64'), full: `shots/${name}` }
    console.error(`  ${cell.label.padEnd(30)} shot -> shots/${name}`)
  } catch (err) {
    console.error(`  ${cell.label.padEnd(30)} shot FAILED: ${String(err).slice(0, 120)}`)
  }

  await page.close()
  return { rows, trace, shot }
}

mkdirSync(TRACES, { recursive: true })
mkdirSync(SHOTS, { recursive: true })
const results = []
const traces = []
const shots = []
for (const cell of CELLS) {
  console.error(`\n[cell] ${cell.label}  (${cell.url})`)
  let browser
  try {
    browser = await chromium.launch({ headless: false })
    const out = await measureCell(browser, cell)
    results.push(...out.rows)
    if (out.trace) traces.push(out.trace)
    if (out.shot) shots.push(out.shot)
  } catch (err) {
    console.error(`  !! ${cell.label} failed: ${String(err).slice(0, 160)}`)
    results.push({ cell: cell.label, error: String(err).slice(0, 300) })
  } finally {
    await browser?.close().catch(() => {})
  }
}

const payload = {
  ranAt: new Date().toISOString(),
  sweep: {
    levels: LEVELS,
    modes: MODES,
    sampleMs: SAMPLE_MS,
    settleMs: SETTLE_MS,
    traceMs: TRACE ? TRACE_MS : 0,
    traceFocus: { mode: TRACE_MODE, level: TRACE_LEVEL },
  },
  cells: CELLS.map((c) => c.label),
  traces,
  shots,
  results,
}
writeFileSync(join(HERE, 'results.json'), JSON.stringify(payload))
console.error(`\nwrote ${join(HERE, 'results.json')} (${results.length} rows, ${traces.length} traces)`)
