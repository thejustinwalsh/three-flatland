import opentype from 'opentype.js'
import type { PathCommand } from 'opentype.js'
import type { QuadCurve, GlyphBounds, SlugGlyphData } from '../types.js'
import { buildBands } from './bandBuilder.js'

/**
 * Epsilon for converting straight lines to degenerate quadratics.
 * Small bowing prevents scanline dropout in the root eligibility check.
 */
const LINE_EPSILON = 0.125

/** Parse a font from an ArrayBuffer into glyph data suitable for Slug rendering. */
export function parseFont(buffer: ArrayBuffer): {
  glyphs: Map<number, SlugGlyphData>
  unitsPerEm: number
  ascender: number
  descender: number
  capHeight: number
} {
  const font = opentype.parse(buffer)
  const unitsPerEm = font.unitsPerEm
  const ascender = font.ascender / unitsPerEm
  const descender = font.descender / unitsPerEm

  // Try to get cap height from OS/2 table, fallback to ascender
  const os2 = font.tables['os2'] as { sCapHeight?: number } | undefined
  const capHeight = os2?.sCapHeight ? os2.sCapHeight / unitsPerEm : ascender

  const glyphs = new Map<number, SlugGlyphData>()

  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i)
    if (!glyph || !glyph.path || glyph.path.commands.length === 0) continue

    const { curves, contourStarts } = extractCurves(glyph.path.commands, unitsPerEm)
    if (curves.length === 0) continue

    const bounds = computeBounds(curves)
    const bands = buildBands(curves, bounds)

    glyphs.set(glyph.index, {
      glyphId: glyph.index,
      curves,
      contourStarts,
      bands,
      bounds,
      advanceWidth: (glyph.advanceWidth ?? 0) / unitsPerEm,
      lsb: (glyph.leftSideBearing ?? 0) / unitsPerEm,
      // These get filled in by texturePacker
      bandLocation: { x: 0, y: 0 },
      curveLocation: { x: 0, y: 0 },
    })
  }

  return { glyphs, unitsPerEm, ascender, descender, capHeight }
}

/** Load and parse a font from a URL. */
export async function loadFont(url: string): Promise<ReturnType<typeof parseFont>> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  return parseFont(buffer)
}

/** Extract quadratic Bezier curves from an opentype.js path, tracking contour boundaries. */
function extractCurves(commands: PathCommand[], unitsPerEm: number): { curves: QuadCurve[]; contourStarts: number[] } {
  const curves: QuadCurve[] = []
  const contourStarts: number[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  const scale = 1 / unitsPerEm

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        contourStarts.push(curves.length)
        cx = (cmd.x ?? 0) * scale
        cy = (cmd.y ?? 0) * scale
        startX = cx
        startY = cy
        break

      case 'L': {
        const ex = (cmd.x ?? 0) * scale
        const ey = (cmd.y ?? 0) * scale
        curves.push(lineToQuadratic(cx, cy, ex, ey))
        cx = ex
        cy = ey
        break
      }

      case 'Q': {
        const cpx = (cmd.x1 ?? 0) * scale
        const cpy = (cmd.y1 ?? 0) * scale
        const ex = (cmd.x ?? 0) * scale
        const ey = (cmd.y ?? 0) * scale
        curves.push({ p0x: cx, p0y: cy, p1x: cpx, p1y: cpy, p2x: ex, p2y: ey })
        cx = ex
        cy = ey
        break
      }

      case 'C': {
        // Cubic Bezier → split into 2 quadratics at t=0.5 via De Casteljau
        const c1x = (cmd.x1 ?? 0) * scale
        const c1y = (cmd.y1 ?? 0) * scale
        const c2x = (cmd.x2 ?? 0) * scale
        const c2y = (cmd.y2 ?? 0) * scale
        const ex = (cmd.x ?? 0) * scale
        const ey = (cmd.y ?? 0) * scale
        const quads = cubicToQuadratics(cx, cy, c1x, c1y, c2x, c2y, ex, ey)
        curves.push(...quads)
        cx = ex
        cy = ey
        break
      }

      case 'Z': {
        // Close path — emit closing line if needed
        if (cx !== startX || cy !== startY) {
          curves.push(lineToQuadratic(cx, cy, startX, startY))
        }
        cx = startX
        cy = startY
        break
      }
    }
  }

  return { curves, contourStarts }
}

/**
 * Convert a line segment to a degenerate quadratic Bezier.
 * Adds slight bowing for diagonal lines to prevent scanline dropout.
 * Axis-aligned lines get exact midpoints.
 */
function lineToQuadratic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): QuadCurve {
  const mx = (x0 + x1) * 0.5
  const my = (y0 + y1) * 0.5

  // For diagonal lines, add slight perpendicular bowing
  const dx = x1 - x0
  const dy = y1 - y0
  const isAxisAligned = Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6

  if (isAxisAligned) {
    return { p0x: x0, p0y: y0, p1x: mx, p1y: my, p2x: x1, p2y: y1 }
  }

  // Perpendicular bowing to prevent scanline dropout in CalcRootCode.
  // Magnitude must be large enough to perturb sign bits reliably.
  const len = Math.sqrt(dx * dx + dy * dy)
  const invLen = LINE_EPSILON / len
  const nx = -dy * invLen
  const ny = dx * invLen

  return {
    p0x: x0,
    p0y: y0,
    p1x: mx + nx,
    p1y: my + ny,
    p2x: x1,
    p2y: y1,
  }
}

/**
 * Split a cubic Bezier at t=0.5 into two quadratic Beziers using De Casteljau.
 * This is an approximation — each half's quadratic control point is derived
 * from the cubic's tangent at the split point.
 */
function cubicToQuadratics(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x3: number,
  y3: number,
): QuadCurve[] {
  // De Casteljau at t=0.5
  const m01x = (x0 + c1x) * 0.5
  const m01y = (y0 + c1y) * 0.5
  const m12x = (c1x + c2x) * 0.5
  const m12y = (c1y + c2y) * 0.5
  const m23x = (c2x + x3) * 0.5
  const m23y = (c2y + y3) * 0.5
  const m012x = (m01x + m12x) * 0.5
  const m012y = (m01y + m12y) * 0.5
  const m123x = (m12x + m23x) * 0.5
  const m123y = (m12y + m23y) * 0.5
  const midx = (m012x + m123x) * 0.5
  const midy = (m012y + m123y) * 0.5

  // Each half-cubic's quadratic control point is the second-level De Casteljau midpoint:
  //   first half:  (p0, m01, mid)  — control point is m012 (NOT m01)
  //   second half: (mid, m123, p3) — control point is m123 (NOT m23)
  // Using the second-level points preserves the cubic's tangent at the split.
  return [
    {
      p0x: x0,
      p0y: y0,
      p1x: m012x,
      p1y: m012y,
      p2x: midx,
      p2y: midy,
    },
    {
      p0x: midx,
      p0y: midy,
      p1x: m123x,
      p1y: m123y,
      p2x: x3,
      p2y: y3,
    },
  ]
}

/** Compute bounding box of all curves. */
function computeBounds(curves: QuadCurve[]): GlyphBounds {
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity

  for (const c of curves) {
    xMin = Math.min(xMin, c.p0x, c.p1x, c.p2x)
    yMin = Math.min(yMin, c.p0y, c.p1y, c.p2y)
    xMax = Math.max(xMax, c.p0x, c.p1x, c.p2x)
    yMax = Math.max(yMax, c.p0y, c.p1y, c.p2y)
  }

  return { xMin, yMin, xMax, yMax }
}
