import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RedFormat,
  RGBAFormat,
} from 'three'
import type { Band, PagedTextureData, SlugGlyphData, SlugTextureData } from '../types.js'

/** Default texture width in texels (must be power of 2). */
const TEXTURE_WIDTH = 4096

/**
 * Per-page budget on a page's estimated curve-texel rows (texel-estimate /
 * TEXTURE_WIDTH), well under the 4096-row hard cap `packRefCoord` enforces —
 * a single glyph's own texel footprint never approaches this, so the budget
 * check in `packTextures` only ever closes a page BETWEEN glyphs, never
 * mid-glyph. A glyph's curves + bands always land entirely on one page.
 */
const PAGE_CURVE_ROW_BUDGET = 2048

// ── Band texel packing (R32Float, single channel) ──────────────────────────
// Every band texel packs two small non-negative integers into ONE float32.
// float32 stores integers ≤ 2^24-1 (16,777,215) exactly, so both encodings are
// bit-exact — the decoded count/offset/texelX/texelY equal the pre-pack values.
// The matching shader decode lives in `shaders/slugFragment.ts` + `slugStroke.ts`.

/** log2(TEXTURE_WIDTH). A curve-ref texel packs texelY in the high bits and
 *  texelX (< 4096) in the low 12 bits: `texelY << 12 | texelX`. */
const LOG_TEXTURE_WIDTH = 12
const TEXTURE_WIDTH_MASK = (1 << LOG_TEXTURE_WIDTH) - 1 // 4095

/**
 * Band-header bit split: `curveCount` in the high 10 bits, `curveListOffset` in
 * the low 14 bits → `curveCount << 14 | curveListOffset`. Max packed value is
 * `1023 * 16384 + 16383 = 2^24-1`, exact in float32.
 *
 * - 10-bit count (≤ 1023) covers `MAX_SAFE_BAND_CURVES` (512, the shader's read
 *   cap) with 2× headroom; no real font band approaches 1023 curves.
 * - 14-bit offset (≤ 16383) covers the largest per-glyph curve-list offset
 *   (offset is glyph-relative — Inter-Regular's densest glyph observes offsets
 *   in the low hundreds, so 16383 leaves ample headroom). Both are GUARDED.
 */
const HEADER_OFFSET_BITS = 14
const HEADER_OFFSET_MASK = (1 << HEADER_OFFSET_BITS) - 1 // 16383
const MAX_HEADER_COUNT = (1 << (24 - HEADER_OFFSET_BITS)) - 1 // 1023

/**
 * Pack a band header `(curveCount, curveListOffset)` into one float32. Both are
 * small non-negative integers and round-trip exactly. Throws {@link RangeError}
 * if either exceeds its field so a silent bit-collision can never ship.
 */
export function packHeader(count: number, offset: number): number {
  if (!Number.isInteger(count) || count < 0 || count > MAX_HEADER_COUNT) {
    throw new RangeError(
      `packHeader: band curve count ${count} out of range 0..${MAX_HEADER_COUNT} ` +
        `(the ${24 - HEADER_OFFSET_BITS}-bit header count field)`
    )
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > HEADER_OFFSET_MASK) {
    throw new RangeError(
      `packHeader: curve-list offset ${offset} out of range 0..${HEADER_OFFSET_MASK} ` +
        `(the ${HEADER_OFFSET_BITS}-bit header offset field)`
    )
  }
  return count * (HEADER_OFFSET_MASK + 1) + offset
}

/**
 * Pack a curve-ref `(texelX, texelY)` into one float32 as `texelY << 12 | texelX`.
 * `texelX` is always `< TEXTURE_WIDTH` by construction; `texelY` is GUARDED to
 * the same 12-bit range and throws {@link RangeError} if the band curve-ref
 * texture ever exceeds 4096 rows.
 */
export function packRefCoord(texelX: number, texelY: number): number {
  if (!Number.isInteger(texelY) || texelY < 0 || texelY > TEXTURE_WIDTH_MASK) {
    throw new RangeError(
      `packRefCoord: curve texel Y ${texelY} out of range 0..${TEXTURE_WIDTH_MASK} ` +
        `(curve texture exceeded ${TEXTURE_WIDTH_MASK + 1} rows — split the atlas)`
    )
  }
  // texelX < TEXTURE_WIDTH by construction (curveOffset % TEXTURE_WIDTH).
  return texelY * (TEXTURE_WIDTH_MASK + 1) + texelX
}

/**
 * A glyph's band-texel layout after full (non-adjacent) curve-list dedup.
 *
 * `hOffsets[b]` / `vOffsets[b]` are the glyph-relative curve-list offsets
 * written into each band's header. Identical curve-index lists ANYWHERE in the
 * glyph — across hBands AND vBands, not merely adjacent — resolve to the same
 * offset, so their refs are emitted once. `emits` is the set of ref lists to
 * write, in ascending offset order; `total` is the glyph's whole band span
 * (headers + deduped refs).
 *
 * Deterministic from the curve-index sequences alone — independent of where the
 * referenced curves land in the curve texture — so the size pre-pass and the
 * write pass build an identical layout and agree on `total` exactly.
 */
interface BandLayout {
  hOffsets: number[]
  vOffsets: number[]
  emits: { start: number; indices: number[] }[]
  total: number
}

/**
 * Plan a glyph's band layout, deduplicating EVERY identical curve-ref list —
 * not just the previous band's. A per-glyph map from the full ordered
 * curve-index list (a stable joined key) to its already-written glyph-relative
 * offset lets any later band with the same list reuse that storage instead of
 * re-emitting refs. Decoded `(count, offset)` still resolves to the same curve
 * indices — only storage is shared.
 *
 * Scope is per glyph on purpose: the shader decodes a header's offset relative
 * to the glyph's own band location, and a ref texel is a glyph-local curve
 * pointer, so a match only shares storage correctly WITHIN one glyph.
 */
function planGlyphBands(hBands: Band[], vBands: Band[]): BandLayout {
  const headerTexels = hBands.length + vBands.length
  const seen = new Map<string, number>()
  const hOffsets = new Array<number>(hBands.length)
  const vOffsets = new Array<number>(vBands.length)
  const emits: { start: number; indices: number[] }[] = []
  let cursor = headerTexels // ref lists begin immediately after the headers

  const place = (bands: Band[], offsets: number[]) => {
    for (let b = 0; b < bands.length; b++) {
      const indices = bands[b]!.curveIndices
      const key = indices.join(',')
      const shared = seen.get(key)
      // Reuse an earlier identical list, but only if its offset still fits the
      // 14-bit header field. A reused offset is always ≤ the current cursor, so
      // it satisfies the guard whenever a fresh write here would — the check is
      // belt-and-suspenders: dedup never emits an out-of-range header (it falls
      // back to a fresh copy instead of throwing).
      if (shared !== undefined && shared <= HEADER_OFFSET_MASK) {
        offsets[b] = shared
      } else {
        const offset = cursor
        offsets[b] = offset
        emits.push({ start: offset, indices })
        cursor += indices.length
        // Record for later reuse only when the offset is addressable. An offset
        // past the guard is a genuine per-glyph capacity overflow the writer
        // surfaces via packHeader, not something dedup should hand out.
        if (offset <= HEADER_OFFSET_MASK) seen.set(key, offset)
      }
    }
  }

  place(hBands, hOffsets)
  place(vBands, vOffsets)

  return { hOffsets, vOffsets, emits, total: cursor }
}

/** Round up to next power of 2. */
function nextPow2(n: number): number {
  if (n <= 0) return 1
  n--
  n |= n >> 1
  n |= n >> 2
  n |= n >> 4
  n |= n >> 8
  n |= n >> 16
  return n + 1
}

/**
 * Upper-bound estimate of a glyph's curve-texel footprint: endpoint sharing
 * means each contour of N curves needs N+1 texels, plus +1 per curve for
 * worst-case row-boundary padding. The SAME formula the page-assignment
 * budget check and each page's size pre-pass both use, so they agree on
 * cost exactly.
 */
function estimateGlyphCurveTexels(glyph: SlugGlyphData): number {
  let texels = 0
  const starts = glyph.contourStarts
  for (let c = 0; c < starts.length; c++) {
    const contourStart = starts[c]!
    const contourEnd = c + 1 < starts.length ? starts[c + 1]! : glyph.curves.length
    const contourCurves = contourEnd - contourStart
    texels += contourCurves * 2 + 1
  }
  return texels
}

/**
 * Pack all glyph curve and band data into GPU DataTextures, split across as
 * many PAGES as needed to keep every page's curve texture under the
 * 4096-row cap `packRefCoord` enforces — a dense glyph set (CJK) can exceed
 * 4096 rows in one page; every Latin font today fits in one.
 *
 * Page assignment is greedy: glyphs are walked in Map iteration order and
 * appended to the current page until the next glyph would push the page's
 * estimated curve-texel rows past `PAGE_CURVE_ROW_BUDGET`, at which point
 * the page closes and a new one starts. A glyph's curves + bands always
 * land entirely on ONE page — pages never split a glyph. Each page is then
 * packed independently by `packPage`, whose curve/band offset counters
 * start fresh at 0 — so a glyph's `curveLocation`/`bandLocation` are
 * PAGE-RELATIVE texel coordinates, and `packRefCoord`'s texelY guard is
 * checked against that page's own height, never the combined total.
 *
 * When every glyph fits on one page (every Latin font today), `packPage` —
 * unchanged from the pre-paging packer, just scoped to a glyph subset —
 * produces byte-identical output to the original single-texture pack.
 */
export function packTextures(glyphs: Map<number, SlugGlyphData>): PagedTextureData {
  const pageGroups: Map<number, SlugGlyphData>[] = []
  let current = new Map<number, SlugGlyphData>()
  let currentTexels = 0

  for (const [glyphId, glyph] of glyphs) {
    const glyphTexels = estimateGlyphCurveTexels(glyph)
    const wouldBeRows = Math.ceil((currentTexels + glyphTexels) / TEXTURE_WIDTH)
    if (current.size > 0 && wouldBeRows > PAGE_CURVE_ROW_BUDGET) {
      pageGroups.push(current)
      current = new Map()
      currentTexels = 0
    }
    current.set(glyphId, glyph)
    currentTexels += glyphTexels
  }
  // Always emit at least one page, even for an empty glyph set — matches
  // packPage's own empty-input handling (a minimal 1x1-texel page).
  if (current.size > 0 || pageGroups.length === 0) pageGroups.push(current)

  const pages = pageGroups.map((pageGlyphs, pageIndex) => {
    const page = packPage(pageGlyphs)
    for (const glyph of pageGlyphs.values()) glyph.page = pageIndex
    return page
  })

  return { pages, textureWidth: TEXTURE_WIDTH }
}

/**
 * Extract the single page of a pack, or throw a clear error when the glyph set
 * spilled onto more than one. Callers that still bind ONE curve/band texture
 * pair (SlugFont/SlugText render, the bake CLI, SlugShapeSet) use this instead
 * of silently taking `pages[0]` and dropping every glyph past the first — that
 * silent-drop was the failure mode multi-page rendering (a later milestone)
 * will remove. Until then, subset the font/shape set to fit one page (≈16k
 * glyphs / under the 4096-row curve-texture cap). See
 * planning/perf/glyph-paging-design.md.
 */
export function singlePageOrThrow(paged: PagedTextureData, context: string): SlugTextureData {
  if (paged.pages.length !== 1) {
    throw new Error(
      `${context}: glyph set spans ${paged.pages.length} texture pages, but multi-page ` +
        `rendering is not yet implemented. Subset the font/shapes to fit one page ` +
        `(≈16k glyphs, under the 4096-row curve-texture cap). See ` +
        `planning/perf/glyph-paging-design.md.`
    )
  }
  return paged.pages[0]!
}

/**
 * Pack one page's worth of glyphs into a single curve/band DataTexture
 * pair. `curveOffset`/`bandOffset` start at 0, so every `curveLocation`/
 * `bandLocation` this writes is page-relative.
 *
 * Curve Texture (RGBA16F — HalfFloatType):
 *   - 2 texels per curve: [p0x, p0y, p1x, p1y] + [p2x, p2y, 0, 0]
 *   - Endpoint sharing: contiguous curves share texels
 *   - 8 bytes per texel vs 16 for Float32 — halves texture bandwidth.
 *     Em-space coordinates are in ~[-1, +1.25], well within half-float
 *     range and at ~11-bit mantissa precision which is subpixel-accurate
 *     at all realistic rendering sizes.
 *
 * Band Texture (R32Float — FloatType, single-channel):
 *   - Per glyph: [hBand headers][vBand headers][curve ref lists]
 *   - Header texel: `packHeader(curveCount, offsetFromGlyphStart)` — two ints
 *     packed into one float32 (count << 14 | offset), exact up to 2^24-1.
 *   - Curve-ref texel: `packRefCoord(texelX, texelY)` = texelY << 12 | texelX,
 *     a pointer into the curve texture, exact up to 2^24-1.
 *   - 4 bytes per texel vs 8 for the old RG32F — halves every band read
 *     (~2 headers + 1 ref-per-curve per fragment). Universal bandwidth win.
 */
function packPage(glyphs: Map<number, SlugGlyphData>): SlugTextureData {
  // First pass: calculate total sizes
  let totalCurveTexels = 0
  let totalBandTexels = 0
  // Band layout is planned once per glyph here (dedup-aware) and reused by the
  // write pass, so the allocated band texture is sized to the deduped footprint
  // rather than the no-dedup upper bound.
  const bandPlans: BandLayout[] = []

  for (const glyph of glyphs.values()) {
    totalCurveTexels += estimateGlyphCurveTexels(glyph)

    // Band headers + deduped curve reference lists (planned once, reused below).
    const plan = planGlyphBands(glyph.bands.hBands, glyph.bands.vBands)
    bandPlans.push(plan)
    totalBandTexels += plan.total
  }

  // Calculate texture heights — round up to next power of 2 for GPU compression support
  const curveHeight = nextPow2(Math.max(1, Math.ceil(totalCurveTexels / TEXTURE_WIDTH)))
  const bandHeight = nextPow2(Math.max(1, Math.ceil(totalBandTexels / TEXTURE_WIDTH)))

  // Allocate buffers.
  // Curve texture: 4 channels × 2 bytes (half-float) = 8 bytes/texel.
  // Band texture: 1 channel × 4 bytes (float) = 4 bytes/texel (packed).
  const curveData = new Uint16Array(TEXTURE_WIDTH * curveHeight * 4) // RGBA half-float
  const bandData = new Float32Array(TEXTURE_WIDTH * bandHeight * 1) // R float (packed)

  let curveOffset = 0 // texel offset into curve texture
  let bandOffset = 0 // texel offset into band texture
  let glyphIndex = 0 // consumes bandPlans in the same glyph order as the pre-pass

  for (const glyph of glyphs.values()) {
    // Record glyph's curve location
    glyph.curveLocation = {
      x: curveOffset % TEXTURE_WIDTH,
      y: Math.floor(curveOffset / TEXTURE_WIDTH),
    }

    // Record glyph's band location
    glyph.bandLocation = {
      x: bandOffset % TEXTURE_WIDTH,
      y: Math.floor(bandOffset / TEXTURE_WIDTH),
    }

    // Pack curves with endpoint sharing.
    // Within a contour, curve i's texel is [p0x, p0y, p1x, p1y] and
    // curve i+1's first channel pair is [p2x, p2y] = the shared endpoint.
    // The shader reads texel[i] and texel[i+1] — works identically.
    //
    // curveTexelMap[curveIndex] = texel offset of that curve's first texel
    const curveTexelMap = new Array<number>(glyph.curves.length)
    const starts = glyph.contourStarts

    for (let c = 0; c < starts.length; c++) {
      const contourStart = starts[c]!
      const contourEnd = c + 1 < starts.length ? starts[c + 1]! : glyph.curves.length

      for (let ci = contourStart; ci < contourEnd; ci++) {
        const curve = glyph.curves[ci]!

        // Ensure the texel pair [offset, offset+1] doesn't cross a row boundary.
        // If we're at the last column, skip to the start of the next row.
        if (curveOffset % TEXTURE_WIDTH === TEXTURE_WIDTH - 1) {
          curveOffset++ // skip padding texel
        }

        curveTexelMap[ci] = curveOffset

        const idx = curveOffset * 4
        curveData[idx] = DataUtils.toHalfFloat(curve.p0x)
        curveData[idx + 1] = DataUtils.toHalfFloat(curve.p0y)
        curveData[idx + 2] = DataUtils.toHalfFloat(curve.p1x)
        curveData[idx + 3] = DataUtils.toHalfFloat(curve.p1y)
        curveOffset++
      }

      // Final endpoint texel — also must not land at x=4095 if it would
      // be read as part of the last curve's pair (it always is).
      // The check above already ensures the last curve's texel is at x < 4095,
      // so curveOffset here is at most x=4095 which is fine (endpoint is the +1 read).
      const lastCurve = glyph.curves[contourEnd - 1]!
      const idx = curveOffset * 4
      curveData[idx] = DataUtils.toHalfFloat(lastCurve.p2x)
      curveData[idx + 1] = DataUtils.toHalfFloat(lastCurve.p2y)
      curveData[idx + 2] = 0 // half-float zero is bit-pattern 0
      curveData[idx + 3] = 0
      curveOffset++
    }

    // Pack band data using the pre-planned, dedup-aware layout. `planGlyphBands`
    // shares one copy of storage across ALL identical curve-ref lists in the
    // glyph (hBands + vBands, non-adjacent), so headers may point at an earlier
    // list; only distinct lists are emitted.
    const glyphBandStart = bandOffset
    const plan = bandPlans[glyphIndex++]!
    const hBands = glyph.bands.hBands
    const vBands = glyph.bands.vBands
    const numHBands = hBands.length

    // Headers: hBand headers first, then vBand headers — one packed R32F texel
    // each, carrying (curveCount, glyph-relative curve-list offset).
    for (let b = 0; b < hBands.length; b++) {
      bandData[glyphBandStart + b] = packHeader(hBands[b]!.curveIndices.length, plan.hOffsets[b]!)
    }
    for (let b = 0; b < vBands.length; b++) {
      bandData[glyphBandStart + numHBands + b] = packHeader(
        vBands[b]!.curveIndices.length,
        plan.vOffsets[b]!
      )
    }

    // Curve-ref lists — one copy per distinct list, at its planned offset.
    for (const emit of plan.emits) {
      let w = glyphBandStart + emit.start
      for (const curveIdx of emit.indices) {
        const curveTexelOffset = curveTexelMap[curveIdx]!
        bandData[w++] = packRefCoord(
          curveTexelOffset % TEXTURE_WIDTH,
          Math.floor(curveTexelOffset / TEXTURE_WIDTH)
        )
      }
    }

    bandOffset = glyphBandStart + plan.total
  }

  // Curve texture — RGBA16F (half-float).
  const curveTexture = new DataTexture(
    curveData,
    TEXTURE_WIDTH,
    curveHeight,
    RGBAFormat,
    HalfFloatType
  )
  curveTexture.minFilter = NearestFilter
  curveTexture.magFilter = NearestFilter
  curveTexture.needsUpdate = true

  // Band texture — R32F (single channel). Each texel packs two small non-negative
  // integers (header = count/offset, ref = texelX/texelY) into one float32 — all
  // exact in float32's 24-bit mantissa. Halves texel width vs the old RG32F.
  const bandTexture = new DataTexture(bandData, TEXTURE_WIDTH, bandHeight, RedFormat, FloatType)
  bandTexture.minFilter = NearestFilter
  bandTexture.magFilter = NearestFilter
  bandTexture.needsUpdate = true

  return {
    curveTexture,
    bandTexture,
    textureWidth: TEXTURE_WIDTH,
  }
}
