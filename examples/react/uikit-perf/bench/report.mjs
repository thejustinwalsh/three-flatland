// Renders bench/results.json into bench/report.md. Groups by workload (mode x preset) with the cells
// as rows so you compare like-for-like at each load. Run automatically after run.mjs via the `bench`
// script, or standalone: `node bench/report.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(HERE, 'results.json'), 'utf8'))

const MODE_LABEL = {
  cards: 'Cards (layout + glyphs)',
  decorated: 'Decorated (+ panels, borders, depth)',
  sampled: 'Sampled (+ per-card color signal)',
}

const ok = data.results.filter((r) => r.error == null)
const errors = data.results.filter((r) => r.error != null)
const num = (x) => (typeof x === 'number' ? String(x) : '—')
const ms = (x) => (typeof x === 'number' ? x.toFixed(2) : 'n/a')

// group by mode then level
const groups = new Map()
for (const r of ok) {
  const key = `${r.mode}::${r.level}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(r)
}

const lines = []
lines.push('# uikit render benchmark')
lines.push('')
lines.push(`Ran: ${data.ranAt}`)
lines.push(
  `Sweep: levels [${data.sweep.levels.join(', ')}], modes [${data.sweep.modes.join(', ')}], ` +
    `${data.sweep.frames} frames/cell, ${data.sweep.settleMs}ms settle. Real GPU, non-headless Playwright.`
)
lines.push(`Cells: ${data.cells.join(' · ')}`)
lines.push('')
lines.push(
  '> Frame/GPU times are per-frame p50/p95 in ms (lower = better). Jitter = p95−p50 (lower = smoother). ' +
    'GPU = renderer timestamp query (WebGPU: TimestampQuery; WebGL2: EXT_disjoint_timer_query, Chrome).'
)
lines.push('')

const sortedKeys = [...groups.keys()].sort((a, b) => {
  const [ma, la] = a.split('::')
  const [mb, lb] = b.split('::')
  return data.sweep.modes.indexOf(ma) - data.sweep.modes.indexOf(mb) || Number(la) - Number(lb)
})

for (const key of sortedKeys) {
  const rows = groups.get(key)
  const [mode] = key.split('::')
  const items = rows[0].items
  lines.push(`## ${MODE_LABEL[mode] ?? mode} — ${items.toLocaleString()} cards`)
  lines.push('')
  lines.push(
    '| Cell | backend | frame p50 | frame p95 | jitter | GPU p50 | GPU p95 | draws | textures | geometries |'
  )
  lines.push('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|')
  for (const r of rows) {
    lines.push(
      `| ${r.cell} | ${r.backend} | ${ms(r.frameMs?.p50)} | ${ms(r.frameMs?.p95)} | ${ms(r.frameMs?.jitter)} ` +
        `| ${ms(r.gpuMs?.p50)} | ${ms(r.gpuMs?.p95)} | ${num(r.drawCalls)} | ${num(r.textures)} | ${num(r.geometries)} |`
    )
  }
  lines.push('')
}

if (errors.length) {
  lines.push('## Cells that failed')
  lines.push('')
  for (const e of errors) lines.push(`- **${e.cell}** — ${e.error}`)
  lines.push('')
}

const outPath = join(HERE, 'report.md')
writeFileSync(outPath, lines.join('\n'))
console.error(`wrote ${outPath}`)
