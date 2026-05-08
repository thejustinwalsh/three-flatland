// Probe: verify the 3-phase sag state machine produces wall-clock
// timings that match the design spec, regardless of monitor refresh
// rate. Constants in src/constants.ts: SAG_PRECARIOUS_TICKS=36,
// SAG_SAGGING_TICKS=36, SAG_SHAKING_TICKS=24, all at 60Hz fixed
// simulation step.
//
// Expected p50 (with ±60ms tolerance):
//   PRECARIOUS → SAGGING : 600ms
//   SAGGING    → SHAKING : 600ms
//   SHAKING    → release : 400ms
//
// Final line MUST emit INTEGRATION_RESULT: {...}.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_PRECARIOUS = 1 << 3
const FLAG_SAGGING = 1 << 0
const FLAG_SHAKING = 1 << 5

const tracker = new Map()
const t0 = performance.now()
const RUN_MS = 90_000

const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    const p = (f & FLAG_PRECARIOUS) !== 0
    const s = (f & FLAG_SAGGING) !== 0
    const k = (f & FLAG_SHAKING) !== 0
    let e = tracker.get(i)
    if ((p || s || k) && !e) {
      e = {
        precOn: p ? tNow : null,
        sagOn: s ? tNow : null,
        shakeOn: k ? tNow : null,
        releaseAt: null,
      }
      tracker.set(i, e)
    }
    if (e) {
      if (p && e.precOn === null) e.precOn = tNow
      if (s && e.sagOn === null) e.sagOn = tNow
      if (k && e.shakeOn === null) e.shakeOn = tNow
      if (grid.tiles[i] === 0 && e.releaseAt === null && e.shakeOn !== null) {
        e.releaseAt = tNow
      }
    }
  }
}, 16)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

const precToSag = []
const sagToShake = []
const shakeToRelease = []
for (const [, e] of tracker) {
  if (e.precOn !== null && e.sagOn !== null) precToSag.push(e.sagOn - e.precOn)
  if (e.sagOn !== null && e.shakeOn !== null) sagToShake.push(e.shakeOn - e.sagOn)
  if (e.shakeOn !== null && e.releaseAt !== null) {
    shakeToRelease.push(e.releaseAt - e.shakeOn)
  }
}

function quantiles(arr) {
  if (!arr.length) return { n: 0, p50: 0, p95: 0, min: 0, max: 0, avg: 0 }
  const sorted = [...arr].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  const avg = sorted.reduce((s, x) => s + x, 0) / sorted.length
  return {
    n: sorted.length,
    p50: Math.round(p50),
    p95: Math.round(p95),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(avg),
  }
}

const result = {
  totalCellsObserved: tracker.size,
  precariousToSagging: quantiles(precToSag),
  saggingToShaking: quantiles(sagToShake),
  // SHAKING→release outliers come from cells that re-entered the
  // lifecycle on a second cascade — the tracker only captures the
  // first shake-on, but the AIR moment may not be observed until a
  // later cycle releases. p50 is the meaningful figure.
  shakingToRelease: quantiles(shakeToRelease),
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
