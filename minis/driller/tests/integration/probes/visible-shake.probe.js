// Probe: cantilever / rock codex visual half — every cell that ever
// flipped FLAG_SHAKING in the GRID must have observed at least one
// frame of non-zero JITTER in the RENDERER. The grid-side bit is
// the contract; the renderer's jitter is the player-visible tell.
// Pre-Phase-2-G integration probes only checked the grid side. The
// user observed (live play) chunks falling without visible shake —
// implying the bits flipped correctly but the renderer didn't draw
// the tell. This probe correlates the two sources.
//
// Concretely: window.__drillerRender (added by TileRenderer.tsx)
// exposes per-cell counters:
//   shakeFramesGrid[idx]      — frames where flags[idx] had SHAKING.
//   shakeFramesRendered[idx]  — frames where the renderer drew jitter
//                               for an idx-mapped sprite slot.
//   lastRenderedFrame[idx]    — last frame this cell was rendered.
// A "silent shake" cell is one where shakeFramesGrid > 0 but
// shakeFramesRendered == 0 — the simulation set the tell but the
// player never saw it. The most common cause: the cell was outside
// the topRow..bottomRow window during the entire SHAKE phase, so
// no sprite was assigned and no jitter was drawn.

const start = Date.now()
while (
  (!window.__drillerWorld || !window.__drillerRender) &&
  Date.now() - start < 8000
) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
const r = window.__drillerRender
w.set(traits.GameState, { runState: 'playing' })

const RUN_MS = 90_000
const SAMPLE_MS = 200
const PROGRESS_MS = 10_000

const t0 = performance.now()
let lastProgressAt = 0
const interval = setInterval(() => {
  const tNow = performance.now() - t0
  if (tNow - lastProgressAt >= PROGRESS_MS) {
    lastProgressAt = tNow
    let gridShakes = 0
    let renderedShakes = 0
    let cellsWithGridShake = 0
    let cellsWithRenderedShake = 0
    for (let i = 0; i < r.shakeFramesGrid.length; i++) {
      const g = r.shakeFramesGrid[i] ?? 0
      const ren = r.shakeFramesRendered[i] ?? 0
      gridShakes += g
      renderedShakes += ren
      if (g > 0) cellsWithGridShake++
      if (ren > 0) cellsWithRenderedShake++
    }
    const driller = w.queryFirst(traits.Driller)
    const dRow = driller ? driller.get(traits.Driller).row : -1
    console.log(
      `[progress] visible-shake t=${Math.round(tNow / 1000)}s/${
        RUN_MS / 1000
      }s dRow=${dRow} window=[${r.windowTopRow}..${r.windowBottomRow}] ` +
        `cellsGridShake=${cellsWithGridShake} cellsRendered=${cellsWithRenderedShake} ` +
        `gridFrames=${gridShakes} renderedFrames=${renderedShakes}`,
    )
  }
}, SAMPLE_MS)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

// Final correlation pass.
const grid = w.get(traits.Grid)
const cols = grid.cols
const violators = []
let totalCellsWithGridShake = 0
let totalCellsWithRenderedShake = 0
let totalCellsRenderedAtLeastOnce = 0
let totalGridFrames = 0
let totalRenderedFrames = 0

for (let i = 0; i < r.shakeFramesGrid.length; i++) {
  const g = r.shakeFramesGrid[i] ?? 0
  const ren = r.shakeFramesRendered[i] ?? 0
  const lastRender = r.lastRenderedFrame[i] ?? -1
  totalGridFrames += g
  totalRenderedFrames += ren
  if (g > 0) totalCellsWithGridShake++
  if (ren > 0) totalCellsWithRenderedShake++
  if (lastRender >= 0) totalCellsRenderedAtLeastOnce++
  // A cell is a "silent shake" violator if it had >= 6 grid-side
  // SHAKING frames (i.e. the bit was set across multiple sample
  // ticks — not a single transient flicker) but the renderer drew
  // ZERO jitter frames. 6 frames at 60Hz is 100ms, well above the
  // smallest meaningful tell.
  if (g >= 6 && ren === 0) {
    if (violators.length < 30) {
      violators.push({
        idx: i,
        row: Math.floor(i / cols),
        col: i % cols,
        gridFrames: g,
        renderedFrames: ren,
        lastRenderedFrame: lastRender,
        finalTile: grid.tiles[i],
      })
    }
  }
}

const finalWindow = { topRow: r.windowTopRow, bottomRow: r.windowBottomRow }
const result = {
  observationMs: RUN_MS,
  totalCellsWithGridShake,
  totalCellsWithRenderedShake,
  totalCellsRenderedAtLeastOnce,
  totalGridFrames,
  totalRenderedFrames,
  silentShakeCells: violators.length,
  silentShakeFrames:
    totalCellsWithGridShake > 0
      ? totalGridFrames - totalRenderedFrames
      : 0,
  finalWindow,
  violatorSamples: violators,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
