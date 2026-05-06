/**
 * One-shot script: load a font through the same pipeline SlugFontLoader uses,
 * then report band-fill statistics so we can tune MAX_CURVES_PER_BAND.
 *
 * Usage: pnpm tsx packages/slug/scripts/analyze-bands.ts <font.ttf>
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFont } from '../src/pipeline/fontParser.js'

function analyze(fontPath: string) {
  const buf = readFileSync(fontPath)
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const { glyphs } = parseFont(arrayBuffer)

  const hCounts: number[] = []
  const vCounts: number[] = []
  const curveCounts: number[] = []

  let maxH = 0, maxV = 0, maxCurves = 0
  let maxHGlyph = -1, maxVGlyph = -1, maxCurvesGlyph = -1

  for (const [glyphId, g] of glyphs) {
    const cc = g.curves.length
    curveCounts.push(cc)
    if (cc > maxCurves) { maxCurves = cc; maxCurvesGlyph = glyphId }

    for (const band of g.bands.hBands) {
      const n = band.curveIndices.length
      hCounts.push(n)
      if (n > maxH) { maxH = n; maxHGlyph = glyphId }
    }
    for (const band of g.bands.vBands) {
      const n = band.curveIndices.length
      vCounts.push(n)
      if (n > maxV) { maxV = n; maxVGlyph = glyphId }
    }
  }

  const pct = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * p)] ?? 0
  }
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const report = (label: string, arr: number[]) => {
    console.log(
      `${label.padEnd(14)} n=${arr.length}  mean=${mean(arr).toFixed(2).padStart(5)}  ` +
      `p50=${pct(arr, 0.5).toString().padStart(3)}  p90=${pct(arr, 0.9).toString().padStart(3)}  ` +
      `p99=${pct(arr, 0.99).toString().padStart(3)}  p999=${pct(arr, 0.999).toString().padStart(3)}  ` +
      `max=${Math.max(...arr).toString().padStart(3)}`
    )
  }

  console.log(`\nGlyphs: ${glyphs.size}\n`)
  report('curves/glyph', curveCounts)
  report('h-band fill', hCounts)
  report('v-band fill', vCounts)
  const allBands = [...hCounts, ...vCounts]
  report('all bands', allBands)

  console.log('\nTop offenders:')
  console.log(`  most curves: glyph ${maxCurvesGlyph} with ${maxCurves} curves`)
  console.log(`  max h-band:  glyph ${maxHGlyph} with ${maxH} curves in one band`)
  console.log(`  max v-band:  glyph ${maxVGlyph} with ${maxV} curves in one band`)

  // Threshold coverage — what does each candidate MAX_CURVES_PER_BAND cover?
  console.log('\nBand-fill coverage at candidate shader loop bounds:')
  for (const t of [8, 12, 16, 20, 24, 32, 48, 64]) {
    const covered = allBands.filter((n) => n <= t).length
    const pct = (covered / allBands.length * 100).toFixed(3)
    const over = allBands.filter((n) => n > t).length
    console.log(`  ≤${t.toString().padStart(2)} curves: ${pct}% (${over} bands exceed)`)
  }
}

const path = resolve(process.argv[2] ?? 'examples/three/slug-text/public/Inter-Regular.ttf')
console.log(`Font: ${path}`)
analyze(path)
