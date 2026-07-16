// Probe: verify the 3-phase sag state machine produces wall-clock
// timings that match the design spec, regardless of monitor refresh
// rate. Constants in src/constants.ts: SAG_PRECARIOUS_TICKS=12,
// SAG_SAGGING_TICKS=30, SAG_SHAKING_TICKS=30, all at 60Hz fixed
// simulation step.
//
// Expected p50 (with ±60ms tolerance):
//   PRECARIOUS → SAGGING : 200ms
//   SAGGING    → SHAKING : 500ms
//   SHAKING    → release : 500ms
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

// Per-incarnation transition tracker. Each cell may go through the
// sag lifecycle multiple times if a fresh chunk lands on it after
// it falls. We collect the FIRST transition timings per incarnation,
// emit them on cell-release (or on cell-AIR), then reset. Without
// the reset, p50 gets polluted by cross-incarnation correlations
// (precOn from one sag, sagOn from a different sag on the same idx).
const tracker = new Map()
const precToSag = []
const sagToShake = []
const shakeToRelease = []
const t0 = performance.now()
const RUN_MS = 90_000
const PROGRESS_MS = 10_000

function flushIncarnation(e, releaseTime) {
  if (e.precOn !== null && e.sagOn !== null) {
    precToSag.push(e.sagOn - e.precOn)
  }
  if (e.sagOn !== null && e.shakeOn !== null) {
    sagToShake.push(e.shakeOn - e.sagOn)
  }
  if (e.shakeOn !== null && releaseTime !== null) {
    shakeToRelease.push(releaseTime - e.shakeOn)
  }
  e.precOn = null
  e.sagOn = null
  e.shakeOn = null
}

let lastProgressAt = 0
const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    const p = (f & FLAG_PRECARIOUS) !== 0
    const s = (f & FLAG_SAGGING) !== 0
    const k = (f & FLAG_SHAKING) !== 0
    const isAir = grid.tiles[i] === 0
    let e = tracker.get(i)
    if ((p || s || k) && !e) {
      e = { precOn: null, sagOn: null, shakeOn: null }
      tracker.set(i, e)
    }
    if (e) {
      if (p && e.precOn === null) e.precOn = tNow
      if (s && e.sagOn === null) e.sagOn = tNow
      if (k && e.shakeOn === null) e.shakeOn = tNow
      // Cell released (went AIR while we had any phase observation)
      // → flush this incarnation's transitions and reset.
      if (isAir && (e.precOn !== null || e.sagOn !== null || e.shakeOn !== null)) {
        flushIncarnation(e, tNow)
      } else if (
        !p &&
        !s &&
        !k &&
        !isAir &&
        (e.precOn !== null || e.sagOn !== null || e.shakeOn !== null)
      ) {
        // All phase flags cleared but the cell is still SOLID — this
        // is a CANCELLATION (sag entity destroyed via partial-drill
        // re-eval at PRECARIOUS/SAGGING boundary; codex-legitimate
        // since SHAKING-phase cancellation is now blocked by Fix A in
        // collapse.ts). DISCARD this incarnation: it never released,
        // and the next sag at the same idx is a separate event whose
        // measurements shouldn't be polluted by stale precOn/sagOn
        // values from minutes ago.
        e.precOn = null
        e.sagOn = null
        e.shakeOn = null
      }
    }
  }
  if (tNow - lastProgressAt >= PROGRESS_MS) {
    lastProgressAt = tNow
    let withPrec = 0,
      withSag = 0,
      withShake = 0,
      withRelease = 0
    for (const [, e] of tracker) {
      if (e.precOn !== null) withPrec++
      if (e.sagOn !== null) withSag++
      if (e.shakeOn !== null) withShake++
      if (e.releaseAt !== null) withRelease++
    }
    console.log(
      `[progress] 3phase t=${Math.round(tNow / 1000)}s/${RUN_MS / 1000}s ` +
        `cells=${tracker.size} prec=${withPrec} sag=${withSag} shake=${withShake} released=${withRelease}`
    )
  }
}, 16)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

// Any incarnations still in-flight at end of observation get their
// pending transitions flushed too (with no release).
for (const [, e] of tracker) {
  flushIncarnation(e, null)
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
