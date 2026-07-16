#!/usr/bin/env node
/**
 * Driller AI tuning harness.
 *
 * Usage:
 *   pnpm --filter @three-flatland/mini-driller exec node tools/run-harness.mjs
 *
 * Runs vitexec --gpu against a fixed seed for 60s, recording AI events
 * (planner switches, sag spawns, hazard spawns, gem collects) and emits
 * a structured report to stdout + JSON to /tmp/driller-harness.json.
 *
 * Metrics measured:
 *   - depthGain         meters dug per minute
 *   - gemsCollected     # of gems picked up
 *   - plannerSwitches   how often the AI changes plan
 *   - sagSpawns         # of SaggingChunks created
 *   - hazardSpawns      # of falling-rock warnings
 *   - explosionEvents   # of explosive detonations
 *   - lateralSpread     max(col) - min(col) over the run (path width)
 */

import { execSync } from 'node:child_process'

const SEED = process.env.SEED ? Number(process.env.SEED) : 42
const DURATION_MS = process.env.DURATION
  ? Number(process.env.DURATION)
  : 60_000

const SCRIPT = `
const SEED = ${SEED}
const DURATION_MS = ${DURATION_MS}

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
if (!window.__drillerWorld) {
  console.log(JSON.stringify({ error: 'world never mounted' }))
  return
}

const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.Seed, { value: SEED })
w.set(traits.GameState, {
  runState: 'playing',
  lives: 99,
  gems: 0,
  depthM: 0,
  deepestM: 0,
  worldNumber: 0,
})

// Sample at 200ms intervals — captures most state transitions.
const samples = []
const planTrack = { last: '', switches: 0 }
const drillerTrack = { minCol: 18, maxCol: 0 }
let lastDepth = 0
let lastGems = 0
let sagSpawns = 0
let hazardSpawns = 0
let explosionEvents = 0
let prevSagCount = 0
let prevHazCount = 0
let prevExpCount = 0

const runStart = Date.now()
while (Date.now() - runStart < DURATION_MS) {
  await new Promise((r) => setTimeout(r, 200))
  const gs = w.get(traits.GameState)
  if (!gs) continue
  let mood = null, driller = null
  w.query(traits.Mood).forEach((e) => { mood ??= e.get(traits.Mood) })
  w.query(traits.Driller).forEach((e) => { driller ??= e.get(traits.Driller) })

  let sagCount = 0, hazCount = 0, expCount = 0
  w.query(traits.SaggingChunk).forEach(() => sagCount++)
  w.query(traits.Hazard).forEach(() => hazCount++)
  w.query(traits.Explosive).forEach((e) => { if (e.get(traits.Explosive).triggered) expCount++ })

  if (sagCount > prevSagCount) sagSpawns += sagCount - prevSagCount
  if (hazCount > prevHazCount) hazardSpawns += hazCount - prevHazCount
  if (expCount > prevExpCount) explosionEvents += expCount - prevExpCount
  prevSagCount = sagCount; prevHazCount = hazCount; prevExpCount = expCount

  if (mood && mood.planner !== planTrack.last) {
    planTrack.switches++
    planTrack.last = mood.planner
  }

  if (driller) {
    if (driller.col < drillerTrack.minCol) drillerTrack.minCol = driller.col
    if (driller.col > drillerTrack.maxCol) drillerTrack.maxCol = driller.col
  }

  lastDepth = gs.deepestM
  lastGems = gs.gems

  // Compact periodic sample
  if (samples.length % 25 === 0) {
    samples.push({
      tSec: ((Date.now() - runStart) / 1000).toFixed(1),
      depth: gs.depthM,
      gems: gs.gems,
      planner: mood?.planner,
      drillerCol: driller?.col,
      drillerRow: driller?.row,
      activeSag: sagCount,
      activeHaz: hazCount,
    })
  }
}

const report = {
  seed: SEED,
  durationMs: Date.now() - runStart,
  finalDepth: lastDepth,
  gemsCollected: lastGems,
  plannerSwitches: planTrack.switches,
  sagSpawns,
  hazardSpawns,
  explosionEvents,
  lateralSpread: drillerTrack.maxCol - drillerTrack.minCol,
  samples,
}
console.log('REPORT_BEGIN')
console.log(JSON.stringify(report, null, 2))
console.log('REPORT_END')
`

const out = execSync(`vitexec --gpu '${SCRIPT.replace(/'/g, "'\\''")}'`, {
  cwd: process.cwd(),
  encoding: 'utf-8',
  stdio: ['inherit', 'pipe', 'pipe'],
  maxBuffer: 16 * 1024 * 1024,
})

const begin = out.indexOf('REPORT_BEGIN')
const end = out.indexOf('REPORT_END')
if (begin < 0 || end < 0) {
  console.error('Harness output missing report markers; raw stdout:')
  console.error(out)
  process.exit(1)
}
const json = out.slice(begin + 'REPORT_BEGIN'.length, end).trim()
const report = JSON.parse(json.replace(/^\[log\]\s*/gm, ''))

const dgPerMin = ((report.finalDepth / report.durationMs) * 60_000).toFixed(1)
console.log('======== Driller AI Tuning Report ========')
console.log(`seed              ${report.seed}`)
console.log(`duration          ${(report.durationMs / 1000).toFixed(1)}s`)
console.log(`final depth       ${report.finalDepth}m  (${dgPerMin}m/min)`)
console.log(`gems collected    ${report.gemsCollected}`)
console.log(`planner switches  ${report.plannerSwitches}`)
console.log(`sag spawns        ${report.sagSpawns}`)
console.log(`hazard spawns     ${report.hazardSpawns}`)
console.log(`explosions        ${report.explosionEvents}`)
console.log(`lateral spread    ${report.lateralSpread} cols`)
console.log()

import { writeFileSync } from 'node:fs'
writeFileSync('/tmp/driller-harness.json', JSON.stringify(report, null, 2))
console.log('Full report → /tmp/driller-harness.json')
