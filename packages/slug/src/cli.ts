#!/usr/bin/env node

/**
 * CLI tool to pre-bake SlugFont data from a font file.
 *
 * Usage:
 *   slug-bake Inter-Regular.ttf
 *   slug-bake Inter-Regular.ttf --range latin --range 0x2000-0x206F
 *   slug-bake Inter-Regular.ttf --range ascii
 *
 * Predefined ranges:
 *   ascii    U+0020–U+007E  (printable ASCII)
 *   latin    U+0000–U+024F  (Basic Latin + Latin Extended-A/B)
 *   latin+   U+0000–U+024F, U+1E00–U+1EFF, U+2000–U+206F, U+20A0–U+20CF, U+2100–U+214F
 *
 * Custom ranges: --range 0x41-0x5A  (hex) or --range 65-90  (decimal)
 *
 * When no --range is specified, all glyphs are included.
 * Missing glyphs at runtime render as a rectangle fallback.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, extname } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from './pipeline/fontParser'
import { packTextures } from './pipeline/texturePacker'
import { bakeStrokeForGlyph } from './pipeline/strokeOffsetter'
import type { CapStyle, JoinStyle } from './pipeline/strokeOffsetter'
import { packBaked } from './baked'
import type { BakedJSON } from './baked'
import type { SlugGlyphData } from './types'

// --- Predefined Unicode ranges ---

const NAMED_RANGES: Record<string, [number, number][]> = {
  ascii: [[0x0020, 0x007e]],
  latin: [[0x0000, 0x024f]],
  'latin+': [
    [0x0000, 0x024f], // Basic Latin + Latin Extended-A/B
    [0x1e00, 0x1eff], // Latin Extended Additional
    [0x2000, 0x206f], // General Punctuation
    [0x20a0, 0x20cf], // Currency Symbols
    [0x2100, 0x214f], // Letterlike Symbols
  ],
}

function parseRanges(rangeArgs: string[]): [number, number][] | null {
  if (rangeArgs.length === 0) return null // null = include all

  const ranges: [number, number][] = []
  for (const arg of rangeArgs) {
    const named = NAMED_RANGES[arg.toLowerCase()]
    if (named) {
      ranges.push(...named)
      continue
    }

    // Parse "0x20-0x7E" or "32-126"
    const match = arg.match(/^(0x[\da-f]+|\d+)-(0x[\da-f]+|\d+)$/i)
    if (!match) {
      console.error(
        `Invalid range: "${arg}". Use named ranges (ascii, latin, latin+) or hex/decimal ranges (0x20-0x7E).`
      )
      process.exit(1)
    }
    const lo = parseInt(match[1]!, match[1]!.startsWith('0x') ? 16 : 10)
    const hi = parseInt(match[2]!, match[2]!.startsWith('0x') ? 16 : 10)
    ranges.push([lo, hi])
  }
  return ranges
}

function charInRanges(charCode: number, ranges: [number, number][]): boolean {
  return ranges.some(([lo, hi]) => charCode >= lo && charCode <= hi)
}

// --- Extraction ---

function extractCmap(font: opentype.Font, ranges: [number, number][] | null): [number, number][] {
  const cmap: [number, number][] = []
  const scanEnd = 0x10000 // BMP

  for (let charCode = 0; charCode < scanEnd; charCode++) {
    if (ranges && !charInRanges(charCode, ranges)) continue
    const glyph = font.charToGlyph(String.fromCharCode(charCode))
    if (glyph && glyph.index !== 0) {
      cmap.push([charCode, glyph.index])
    }
  }
  cmap.sort((a, b) => a[0] - b[0])
  return cmap
}

function extractKerning(font: opentype.Font, glyphIds: Set<number>): [number, number, number][] {
  const kern: [number, number, number][] = []
  const ids = [...glyphIds]

  for (const g1 of ids) {
    for (const g2 of ids) {
      const glyph1 = font.glyphs.get(g1)
      const glyph2 = font.glyphs.get(g2)
      if (!glyph1 || !glyph2) continue
      const value = font.getKerningValue(glyph1, glyph2)
      if (value !== 0) {
        kern.push([g1, g2, value])
      }
    }
  }

  return kern
}

// --- Main ---

interface StrokeSetConfig {
  width: number
  joinStyle: JoinStyle
  capStyle: CapStyle
  miterLimit: number
}

function bakeFont(
  fontPath: string,
  ranges: [number, number][] | null,
  outputBase?: string,
  strokeConfigs: StrokeSetConfig[] = []
): void {
  const fileBuffer = readFileSync(fontPath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  )

  console.log(`Parsing ${basename(fontPath)}...`)
  const parsed = parseFont(arrayBuffer)
  const { glyphs: allGlyphs, unitsPerEm } = parsed

  // Extract cmap (filtered by ranges if specified)
  const otFont = opentype.parse(arrayBuffer)
  const cmap = extractCmap(otFont, ranges)

  // Determine which glyph IDs to keep
  let glyphs: Map<number, SlugGlyphData>
  if (ranges) {
    const keepIds = new Set(cmap.map(([, glyphId]) => glyphId))
    // Always include notdef (glyph 0) as fallback rectangle for missing glyphs
    keepIds.add(0)
    glyphs = new Map()
    for (const [id, data] of allGlyphs) {
      if (keepIds.has(id)) glyphs.set(id, data)
    }
    console.log(`  ${allGlyphs.size} total glyphs, ${glyphs.size} in selected ranges`)
  } else {
    glyphs = allGlyphs
    console.log(`  ${glyphs.size} glyphs, unitsPerEm=${unitsPerEm}`)
  }

  // Add advance-width-only entries for cmap'd glyphs that have no outline
  // (e.g., space). parseFont skips these, but we need their advance widths.
  for (const [, glyphId] of cmap) {
    if (glyphs.has(glyphId)) continue
    const otGlyph = otFont.glyphs.get(glyphId)
    if (!otGlyph) continue
    glyphs.set(glyphId, {
      glyphId,
      curves: [],
      contourStarts: [],
      bands: { hBands: [], vBands: [] },
      bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
      bandLocation: { x: 0, y: 0 },
      curveLocation: { x: 0, y: 0 },
      advanceWidth: (otGlyph.advanceWidth ?? 0) / unitsPerEm,
      lsb: (otGlyph.leftSideBearing ?? 0) / unitsPerEm,
    })
  }

  // Generate stroke sets, if configured. Each configured (width,
  // join, cap, miterLimit) tuple runs every outline-bearing source
  // glyph through `bakeStrokeForGlyph`, producing offset-contour
  // pseudo-glyphs that render through the fill shader at zero extra
  // runtime shader cost. Stroke glyphs get fresh IDs starting at
  // `maxSourceId + 1 + set_idx * sourceIdRange` so lookups at runtime
  // resolve to a unique entry in the combined glyph table.
  const strokeSets: NonNullable<BakedJSON['strokeSets']> = []
  if (strokeConfigs.length > 0) {
    // ID range per stroke set = (maxSourceId + 1), so offsets are
    // always monotone and non-overlapping with source glyph IDs.
    let maxSourceId = 0
    for (const id of glyphs.keys()) if (id > maxSourceId) maxSourceId = id
    const idRange = maxSourceId + 1

    for (let si = 0; si < strokeConfigs.length; si++) {
      const cfg = strokeConfigs[si]!
      const glyphIdOffset = idRange * (si + 1)
      let bakedCount = 0
      for (const [sourceId, sourceGlyph] of Array.from(glyphs.entries())) {
        if (sourceId >= idRange) continue // skip any stroke glyphs already added by earlier sets
        const strokeGlyph = bakeStrokeForGlyph(sourceGlyph, {
          halfWidth: cfg.width,
          joinStyle: cfg.joinStyle,
          capStyle: cfg.capStyle,
          miterLimit: cfg.miterLimit,
        })
        if (!strokeGlyph) continue
        const strokeId = sourceId + glyphIdOffset
        strokeGlyph.glyphId = strokeId
        glyphs.set(strokeId, strokeGlyph)
        bakedCount++
      }
      strokeSets.push({
        width: cfg.width,
        joinStyle: cfg.joinStyle,
        capStyle: cfg.capStyle,
        miterLimit: cfg.miterLimit,
        glyphIdOffset,
      })
      console.log(
        `  stroke set #${si}: width=${cfg.width} join=${cfg.joinStyle} ` +
          `cap=${cfg.capStyle} miterLimit=${cfg.miterLimit} → ${bakedCount} glyphs ` +
          `(offset +${glyphIdOffset})`
      )
    }
  }

  console.log('  Packing textures...')
  const textures = packTextures(glyphs)

  // Shader loop bound — keep in sync with MAX_CURVES_PER_BAND in
  // src/shaders/slugFragment.ts. Bands exceeding this cap get truncated
  // at render time, which is a correctness bug — warn the user so they
  // can either raise the shader bound or subset to fit.
  const SHADER_MAX_CURVES_PER_BAND = 40
  let maxBandFill = 0
  let overBudgetBands = 0
  for (const glyph of glyphs.values()) {
    for (const band of glyph.bands.hBands) {
      if (band.curveIndices.length > maxBandFill) maxBandFill = band.curveIndices.length
      if (band.curveIndices.length > SHADER_MAX_CURVES_PER_BAND) overBudgetBands++
    }
    for (const band of glyph.bands.vBands) {
      if (band.curveIndices.length > maxBandFill) maxBandFill = band.curveIndices.length
      if (band.curveIndices.length > SHADER_MAX_CURVES_PER_BAND) overBudgetBands++
    }
  }
  if (overBudgetBands > 0) {
    console.warn(
      `  WARNING: ${overBudgetBands} bands exceed MAX_CURVES_PER_BAND (${SHADER_MAX_CURVES_PER_BAND}); ` +
        `max observed ${maxBandFill}. Those glyphs will render incorrectly. ` +
        `Increase the shader bound or drop the affected glyphs from the subset.`
    )
  } else {
    console.log(`  max band fill: ${maxBandFill} / ${SHADER_MAX_CURVES_PER_BAND}`)
  }

  // Curve data is Uint16Array (half-float RGBA). Band data is Float32Array (RG).
  // Three's `DataTexture.image` is `{ data, width, height }` but typed as the
  // generic `Texture['image']` union. Narrow once for downstream packing.
  const curveImage = textures.curveTexture.image as {
    data: Uint16Array
    width: number
    height: number
  }
  const bandImage = textures.bandTexture.image as {
    data: Float32Array
    width: number
    height: number
  }
  const curveData = curveImage.data
  const bandData = bandImage.data
  const curveWidth = curveImage.width
  const curveHeight = curveImage.height
  const bandHeight = bandImage.height

  console.log(`  ${cmap.length} cmap entries`)

  console.log('  Extracting kerning...')
  // Stroke glyphs live at offset IDs that opentype.js doesn't know
  // about — filter to source IDs only so extractKerning can look
  // each up in the font's hmtx.
  const maxSourceIdForKern = strokeSets.length > 0 ? strokeSets[0]!.glyphIdOffset : Infinity
  const glyphIds = new Set<number>()
  for (const id of glyphs.keys()) if (id < maxSourceIdForKern) glyphIds.add(id)
  const kern = extractKerning(otFont, glyphIds)
  console.log(`  ${kern.length} kerning pairs`)

  console.log('  Packing binary...')
  const { json, bin } = packBaked({
    metrics: {
      unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
      underlinePosition: parsed.underlinePosition,
      underlineThickness: parsed.underlineThickness,
      strikethroughPosition: parsed.strikethroughPosition,
      strikethroughThickness: parsed.strikethroughThickness,
      subscriptScale: parsed.subscriptScale,
      subscriptOffset: parsed.subscriptOffset,
      superscriptScale: parsed.superscriptScale,
      superscriptOffset: parsed.superscriptOffset,
    },
    textureWidth: curveWidth,
    curveTextureHeight: curveHeight,
    curveData,
    bandTextureHeight: bandHeight,
    bandData,
    glyphs,
    cmap,
    kern,
    ...(strokeSets.length > 0 ? { strokeSets } : {}),
  })

  // Write files. `--output` overrides the derived-from-font-path base.
  const dir = outputBase ? dirname(outputBase) : dirname(fontPath)
  const name = outputBase
    ? basename(outputBase).replace(/\.slug\.(json|bin)?$/, '')
    : basename(fontPath, extname(fontPath))
  const jsonPath = join(dir, `${name}.slug.json`)
  const binPath = join(dir, `${name}.slug.bin`)

  const jsonStr = JSON.stringify(json)
  writeFileSync(jsonPath, jsonStr)
  writeFileSync(binPath, bin)

  const jsonKB = (jsonStr.length / 1024).toFixed(1)
  const binMB = (bin.byteLength / (1024 * 1024)).toFixed(2)
  console.log(`  ${jsonPath} (${jsonKB} KB)`)
  console.log(`  ${binPath} (${binMB} MB)`)
}

const args = process.argv.slice(2)
const fontFiles: string[] = []
const rangeArgs: string[] = []
let outputBase: string | undefined
const strokeWidthArgs: number[] = []
let strokeJoin: JoinStyle = 'miter'
let strokeCap: CapStyle = 'flat'
let miterLimit = 4

function expectValue(flag: string, i: number): string {
  if (i >= args.length) {
    console.error(`${flag} requires a value`)
    process.exit(1)
  }
  return args[i]!
}

// Parse args
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--range' || args[i] === '-r') {
    i++
    rangeArgs.push(expectValue('--range', i))
  } else if (args[i] === '--output' || args[i] === '-o') {
    i++
    outputBase = expectValue('--output', i)
  } else if (args[i] === '--stroke-widths' || args[i] === '--stroke-width') {
    // Comma-separated list of em-space half-widths.
    i++
    const raw = expectValue(args[i - 1]!, i)
    for (const part of raw.split(',')) {
      const n = Number(part.trim())
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid stroke width: "${part}". Expect positive number in em.`)
        process.exit(1)
      }
      strokeWidthArgs.push(n)
    }
  } else if (args[i] === '--stroke-join') {
    i++
    const raw = expectValue('--stroke-join', i)
    if (raw !== 'miter' && raw !== 'round' && raw !== 'bevel') {
      console.error(`--stroke-join must be miter | round | bevel (got "${raw}")`)
      process.exit(1)
    }
    strokeJoin = raw
  } else if (args[i] === '--stroke-cap') {
    i++
    const raw = expectValue('--stroke-cap', i)
    if (raw !== 'flat' && raw !== 'square' && raw !== 'round' && raw !== 'triangle') {
      console.error(`--stroke-cap must be flat | square | round | triangle (got "${raw}")`)
      process.exit(1)
    }
    strokeCap = raw
  } else if (args[i] === '--miter-limit') {
    i++
    const n = Number(expectValue('--miter-limit', i))
    if (!Number.isFinite(n) || n < 1) {
      console.error('--miter-limit must be a number >= 1')
      process.exit(1)
    }
    miterLimit = n
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`Usage: slug-bake <font-file> [options]

Options:
  --range, -r <range>   Unicode range to include (repeatable)
                        Named: ascii, latin, latin+
                        Custom: 0x20-0x7E or 32-126
                        Default: all glyphs
  --output, -o <path>   Output base path (writes <path>.slug.json + .bin).
                        Default: derive from font filename.
  --stroke-widths <list>  Comma-separated em-space stroke half-widths
                        to pre-bake. For each entry, every outlined
                        glyph is offset through the stroke offsetter
                        and packed into the same textures as the source
                        glyphs. Runtime picks the matching baked set;
                        widths not in the list fall back to the async
                        CPU offsetter (Task 20).
  --stroke-join <style> miter | round | bevel. Default 'miter'.
                        Applies to every baked stroke set.
  --stroke-cap <style>  flat | square | round | triangle. Default 'flat'.
                        Used only for open contours (SVG paths).
                        Closed font contours ignore cap style.
  --miter-limit <n>     Miter clip ratio. SVG default 4. Values above
                        clip a given miter to a bevel. Applies to all
                        baked stroke sets.

Examples:
  slug-bake Inter.ttf                          # All glyphs, fill only
  slug-bake Inter.ttf --range ascii            # ASCII only (~95 glyphs)
  slug-bake Inter.ttf --range latin            # Latin (~600 glyphs)
  slug-bake Inter.ttf -r latin -r 0x2000-0x206F  # Latin + punctuation
  slug-bake Inter.ttf -r 0x41-0x5A -o Inter-Caps # Different output name
  slug-bake Inter.ttf --stroke-widths 0.025     # Baked stroke at 0.025 em
  slug-bake Inter.ttf --stroke-widths 0.02,0.05,0.1 --stroke-join round`)
    process.exit(0)
  } else {
    fontFiles.push(args[i]!)
  }
}

const strokeConfigs: StrokeSetConfig[] = strokeWidthArgs.map((width) => ({
  width,
  joinStyle: strokeJoin,
  capStyle: strokeCap,
  miterLimit,
}))

if (fontFiles.length === 0) {
  console.error('No font files specified. Use --help for usage.')
  process.exit(1)
}

const ranges = parseRanges(rangeArgs)
if (ranges) {
  const desc = rangeArgs.join(', ')
  console.log(`Glyph ranges: ${desc}`)
}

for (const fontFile of fontFiles) {
  try {
    bakeFont(fontFile, ranges, outputBase, strokeConfigs)
  } catch (err) {
    console.error(`Error processing ${fontFile}:`, err)
    process.exit(1)
  }
}

console.log('Done.')
