import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { parseFont } from '../src/pipeline/fontParser.js'
import { measureText } from '../src/pipeline/textMeasure.js'

const buf = readFileSync('./examples/three/slug-text/public/Inter-Regular.ttf')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const { glyphs, unitsPerEm, ascender, descender } = parseFont(ab)
const font = opentype.parse(ab)

console.log('Font metrics (em):')
console.log('  unitsPerEm:', unitsPerEm, 'ascender:', ascender.toFixed(3), 'descender:', descender.toFixed(3))
console.log('  fontBoundingBox span (em):', (ascender - descender).toFixed(3))
console.log()

for (const ch of ['H', 'L', 'p', 'x']) {
  const id = font.charToGlyph(ch).index
  const g = glyphs.get(id)!
  console.log(`glyph "${ch}":`, {
    xMin: g.bounds.xMin.toFixed(3),
    yMin: g.bounds.yMin.toFixed(3),
    xMax: g.bounds.xMax.toFixed(3),
    yMax: g.bounds.yMax.toFixed(3),
  })
}

console.log()
console.log('measureText runtime path:')
const line = 'Lorem ipsum dolor sit'
const m = measureText(font, line, 48)
console.log(`  line="${line}" fontSize=48`)
console.log(`  width=${m.width.toFixed(2)}`)
console.log(`  actualBoundingBoxLeft=${m.actualBoundingBoxLeft.toFixed(2)} Right=${m.actualBoundingBoxRight.toFixed(2)}`)
console.log(`  actualBoundingBoxAscent=${m.actualBoundingBoxAscent.toFixed(2)} Descent=${m.actualBoundingBoxDescent.toFixed(2)}`)
console.log(`  fontBoundingBoxAscent=${m.fontBoundingBoxAscent.toFixed(2)} Descent=${m.fontBoundingBoxDescent.toFixed(2)}`)

// ---- Baked path ----
import { measureTextBaked } from '../src/pipeline/textMeasureBaked.js'
import type { BakedFontData } from '../src/baked.js'
import type { SlugGlyphData } from '../src/types.js'

// Build a minimal baked cmap/kern structure for the ASCII subset.
const codes: number[] = []
const glyphIds: number[] = []
for (let c = 0x20; c <= 0x7E; c++) {
  const g = font.charToGlyph(String.fromCharCode(c))
  if (g && g.index !== 0) { codes.push(c); glyphIds.push(g.index) }
}
const baked = {
  glyphs,
  cmapCodes: new Uint16Array(codes),
  cmapGlyphs: new Uint16Array(glyphIds),
  kernData: new Int16Array(0),
  kernCount: 0,
} as unknown as BakedFontData

const bm = measureTextBaked(baked, glyphs as Map<number, SlugGlyphData>, unitsPerEm, ascender, descender, line, 48)
console.log()
console.log('measureText BAKED path:')
console.log(`  width=${bm.width.toFixed(2)}`)
console.log(`  actualBoundingBoxLeft=${bm.actualBoundingBoxLeft.toFixed(2)} Right=${bm.actualBoundingBoxRight.toFixed(2)}`)
console.log(`  actualBoundingBoxAscent=${bm.actualBoundingBoxAscent.toFixed(2)} Descent=${bm.actualBoundingBoxDescent.toFixed(2)}`)
console.log(`  fontBoundingBoxAscent=${bm.fontBoundingBoxAscent.toFixed(2)} Descent=${bm.fontBoundingBoxDescent.toFixed(2)}`)

console.log()
console.log('Per-glyph baked bounds trace (what measureTextBaked sees):')
for (const ch of 'Lorem ipsum dolor sit') {
  if (ch === ' ') { console.log('  " " SPACE'); continue }
  const id = font.charToGlyph(ch).index
  const g = glyphs.get(id)
  if (!g) { console.log(`  "${ch}" NO GLYPH`); continue }
  console.log(`  "${ch}" id=${id} yMin=${g.bounds.yMin.toFixed(3)} yMax=${g.bounds.yMax.toFixed(3)} ascent@48=${(g.bounds.yMax * 48).toFixed(2)}  curves=${g.curves.length}`)
}
