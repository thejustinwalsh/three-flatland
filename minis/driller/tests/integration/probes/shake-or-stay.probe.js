// Probe: codex rule 1 — every FallingChunk must land at row >
// releaseRow (≥1-cell displacement). The game exposes counters at
// `window.__drillerStats`:
//
//   zeroDisplacementRestores: incremented when the codex's belt-
//     and-suspenders restore branch fires (landingRow == releaseRow).
//   properLandings: incremented on every normal landing.
//
// A grid-scraping probe can't distinguish "chunk landed at its own
// release row" (the bug) from "sibling chunk landed on top of a
// freshly-released cell" (legit) — both look like cell→AIR→solid
// at the same index. Reading the counters is unambiguous.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const before = {
  zeroDisplacementRestores: window.__drillerStats?.zeroDisplacementRestores ?? 0,
  properLandings: window.__drillerStats?.properLandings ?? 0,
}

const t0 = performance.now()
const RUN_MS = 90_000
const PROGRESS_MS = 10_000

const interval = setInterval(() => {
  const tNow = performance.now() - t0
  const stats = window.__drillerStats ?? { zeroDisplacementRestores: 0, properLandings: 0 }
  const driller = w.queryFirst(traits.Driller)
  const dRow = driller ? driller.get(traits.Driller).row : '?'
  console.log(
    `[progress] shake-or-stay t=${Math.round(tNow / 1000)}s/${RUN_MS / 1000}s ` +
      `dRow=${dRow} properLandings=${stats.properLandings - before.properLandings} ` +
      `zeroDispRestores=${stats.zeroDisplacementRestores - before.zeroDisplacementRestores}`
  )
}, PROGRESS_MS)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

const after = {
  zeroDisplacementRestores: window.__drillerStats?.zeroDisplacementRestores ?? 0,
  properLandings: window.__drillerStats?.properLandings ?? 0,
}

const result = {
  observationMs: RUN_MS,
  properLandings: after.properLandings - before.properLandings,
  zeroDisplacementRestores: after.zeroDisplacementRestores - before.zeroDisplacementRestores,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
