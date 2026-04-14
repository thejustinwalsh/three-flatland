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
import { parseFont } from './pipeline/fontParser.js'
import { packTextures } from './pipeline/texturePacker.js'
import { packBaked } from './baked.js'
import type { SlugGlyphData } from './types.js'

// --- Predefined Unicode ranges ---

const NAMED_RANGES: Record<string, [number, number][]> = {
  ascii: [[0x0020, 0x007E]],
  latin: [[0x0000, 0x024F]],
  'latin+': [
    [0x0000, 0x024F],   // Basic Latin + Latin Extended-A/B
    [0x1E00, 0x1EFF],   // Latin Extended Additional
    [0x2000, 0x206F],   // General Punctuation
    [0x20A0, 0x20CF],   // Currency Symbols
    [0x2100, 0x214F],   // Letterlike Symbols
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
      console.error(`Invalid range: "${arg}". Use named ranges (ascii, latin, latin+) or hex/decimal ranges (0x20-0x7E).`)
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

function extractCmap(
  font: opentype.Font,
  ranges: [number, number][] | null,
): [number, number][] {
  const cmap: [number, number][] = []
  const scanEnd = 0x10000 // BMP

  for (let charCode = 0; charCode < scanEnd; charCode++) {
    if (ranges && !charInRanges(charCode, ranges)) continue
    const glyph = font.charToGlyph(String.fromCharCode(charCode))
    if (glyph && glyph.index !== 0) {
      cmap.push([charCode, glyph.index])
    }
  }
  cmap.sort((a, b) => a[0]! - b[0]!)
  return cmap
}

function extractKerning(
  font: opentype.Font,
  glyphIds: Set<number>,
): [number, number, number][] {
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

function bakeFont(fontPath: string, ranges: [number, number][] | null): void {
  const fileBuffer = readFileSync(fontPath)
  const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)

  console.log(`Parsing ${basename(fontPath)}...`)
  const { glyphs: allGlyphs, unitsPerEm, ascender, descender, capHeight } = parseFont(arrayBuffer)

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
      `Increase the shader bound or drop the affected glyphs from the subset.`,
    )
  } else {
    console.log(`  max band fill: ${maxBandFill} / ${SHADER_MAX_CURVES_PER_BAND}`)
  }

  // Curve data is Uint16Array (half-float RGBA). Band data is Float32Array (RG).
  const curveData = (textures.curveTexture as any).image.data as Uint16Array
  const bandData = (textures.bandTexture as any).image.data as Float32Array
  const curveWidth = (textures.curveTexture as any).image.width as number
  const curveHeight = (textures.curveTexture as any).image.height as number
  const bandHeight = (textures.bandTexture as any).image.height as number

  console.log(`  ${cmap.length} cmap entries`)

  console.log('  Extracting kerning...')
  const glyphIds = new Set(glyphs.keys())
  const kern = extractKerning(otFont, glyphIds)
  console.log(`  ${kern.length} kerning pairs`)

  console.log('  Packing binary...')
  const { json, bin } = packBaked({
    metrics: { unitsPerEm, ascender, descender, capHeight },
    textureWidth: curveWidth,
    curveTextureHeight: curveHeight,
    curveData,
    bandTextureHeight: bandHeight,
    bandData,
    glyphs,
    cmap,
    kern,
  })

  // Write files
  const dir = dirname(fontPath)
  const name = basename(fontPath, extname(fontPath))
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

// Parse args
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--range' || args[i] === '-r') {
    i++
    if (i >= args.length) {
      console.error('--range requires a value')
      process.exit(1)
    }
    rangeArgs.push(args[i]!)
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`Usage: slug-bake <font-file> [options]

Options:
  --range, -r <range>   Unicode range to include (repeatable)
                        Named: ascii, latin, latin+
                        Custom: 0x20-0x7E or 32-126
                        Default: all glyphs

Examples:
  slug-bake Inter.ttf                          # All glyphs
  slug-bake Inter.ttf --range ascii            # ASCII only (~95 glyphs)
  slug-bake Inter.ttf --range latin            # Latin (~600 glyphs)
  slug-bake Inter.ttf -r latin -r 0x2000-0x206F  # Latin + punctuation`)
    process.exit(0)
  } else {
    fontFiles.push(args[i]!)
  }
}

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
    bakeFont(fontFile, ranges)
  } catch (err) {
    console.error(`Error processing ${fontFile}:`, err)
    process.exit(1)
  }
}

console.log('Done.')
