/**
 * Real lucide markup (post `oslllo-svg-fixer`, straight from
 * `packages/uikit-lucide/icons/`) through the actual `parseSVG` path —
 * SVG text → SVGLoader → `QuadContour[]` → `registerShape`, headless.
 *
 * Proves the parse output is renderable — closed contours, non-degenerate
 * bounds, hole-punching winding, bands built — and pins a fact every
 * consumer and harness must respect: the fixer bakes `fill="black"` on its
 * stroke-to-fill outlines (black is its stand-in for `currentColor`), so
 * `fills[i].color` FAITHFULLY reports black ink, exactly like a browser
 * renders these files. Tinting consumers replace the color per instance
 * (upstream uikit replaces material color the same way). A harness that
 * writes `fills[i].color` and diffs against a white reference sees zero
 * lit pixels in the RGB channels — that was S4's activityIcon/circleIcon
 * "renders nothing" failure, not a parse or rasterization defect.
 *
 * `parseSVG` needs a `DOMParser`; happy-dom provides it, patched so unset
 * style properties read as `''` (browser behavior) instead of `undefined`,
 * which crashes `SVGLoader`'s style scraping.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { parseSVG } from './parseSVG'
import { SlugShapeSet } from '../SlugShapeSet'
import type { QuadContour } from '../types'

const icon = (name: string): string =>
  readFileSync(new URL(`../../../uikit-lucide/icons/${name}.svg`, import.meta.url), 'utf8')

/** Structural slice of a happy-dom element the style patch touches. */
interface StylePatchable {
  style?: object
  children?: Iterable<StylePatchable>
}

/** Browser CSSStyleDeclaration reads '' for unset props; happy-dom reads undefined. */
function patchStyles(el: StylePatchable): void {
  const style = el.style
  if (style) {
    Object.defineProperty(el, 'style', {
      value: new Proxy(style, {
        get: (target, prop) => {
          const v = Reflect.get(target, prop)
          return v === undefined && typeof prop === 'string' ? '' : v
        },
      }),
    })
  }
  for (const child of el.children ?? []) patchStyles(child)
}

beforeAll(() => {
  const win = new Window()
  class ShimDOMParser {
    parseFromString(text: string, type: string): Document {
      const doc = new win.DOMParser().parseFromString(text, type as 'image/svg+xml')
      if (doc.documentElement) patchStyles(doc.documentElement as unknown as StylePatchable)
      return doc as unknown as Document
    }
  }
  vi.stubGlobal('DOMParser', ShimDOMParser)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

/** End-to-start gap of a contour (0 for a closed contour). */
function contourGap(contour: QuadContour): number {
  const first = contour[0]!
  const last = contour[contour.length - 1]!
  return Math.hypot(last.p2x - first.p0x, last.p2y - first.p0y)
}

/** Signed area (shoelace over the control polygon); sign = winding orientation. */
function signedArea(contour: QuadContour): number {
  let twice = 0
  for (const c of contour) {
    twice += c.p0x * c.p1y - c.p1x * c.p0y
    twice += c.p1x * c.p2y - c.p2x * c.p1y
  }
  return twice / 2
}

function contourBounds(contours: QuadContour[]): {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
} {
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity
  for (const contour of contours) {
    for (const c of contour) {
      xMin = Math.min(xMin, c.p0x, c.p1x, c.p2x)
      xMax = Math.max(xMax, c.p0x, c.p1x, c.p2x)
      yMin = Math.min(yMin, c.p0y, c.p1y, c.p2y)
      yMax = Math.max(yMax, c.p0y, c.p1y, c.p2y)
    }
  }
  return { xMin, yMin, xMax, yMax }
}

// pushLine's closing segment lands exactly on the first point; a contour
// already closed within CLOSE_EPSILON (1e-6) is left as-is.
const CLOSED = 2e-6

describe('parseSVG on real lucide icons (post oslllo-svg-fixer)', () => {
  it('activity: one painted shape with closed contours and non-degenerate bounds', () => {
    const parsed = parseSVG(icon('activity'))

    expect(parsed.viewBox).toEqual({ minX: 0, minY: 0, width: 24, height: 24 })
    expect(parsed.shapes).toHaveLength(1)
    expect(parsed.fills).toHaveLength(1)

    const contours = parsed.shapes[0]!
    expect(contours).toHaveLength(1)
    expect(contours[0]!.length).toBeGreaterThan(20)
    expect(contourGap(contours[0]!)).toBeLessThan(CLOSED)
    expect(Math.abs(signedArea(contours[0]!))).toBeGreaterThan(0.05)

    // Normalized y-up unit box: real ink spanning most of the viewBox.
    const b = contourBounds(contours)
    expect(b.xMax - b.xMin).toBeGreaterThan(0.5)
    expect(b.yMax - b.yMin).toBeGreaterThan(0.5)
    expect(b.xMin).toBeGreaterThan(-0.1)
    expect(b.yMin).toBeGreaterThan(-0.1)
    expect(b.xMax).toBeLessThan(1.1)
    expect(b.yMax).toBeLessThan(1.1)
  })

  it('circle: annulus with OPPOSITE winding signs — the hole punches under nonzero', () => {
    const parsed = parseSVG(icon('circle'))

    expect(parsed.shapes).toHaveLength(1)
    const contours = parsed.shapes[0]!
    expect(contours).toHaveLength(2)
    for (const contour of contours) {
      expect(contourGap(contour)).toBeLessThan(CLOSED)
    }

    const outer = signedArea(contours[0]!)
    const inner = signedArea(contours[1]!)
    expect(Math.abs(outer)).toBeGreaterThan(0.4)
    expect(Math.abs(inner)).toBeGreaterThan(0.3)
    // Counter-wound ring: nonzero winding cancels inside the inner contour.
    expect(Math.sign(outer)).toBe(-Math.sign(inner))
    // Outer must enclose more area than the hole it subtracts.
    expect(Math.abs(outer)).toBeGreaterThan(Math.abs(inner))
  })

  it('fills faithfully report the fixer output: fill="black", fill-rule="evenodd"', () => {
    // The fixer writes `stroke="none" fill="black"` — black IS the parsed
    // ink color (a browser renders these icons black). White is only the
    // default for paths whose fill resolves to `none`. Consumers tint by
    // REPLACING the instance color, never by trusting icon fills to be
    // white — and any pixel harness must do the same or diff against a
    // black reference.
    for (const name of ['activity', 'circle']) {
      const { fills } = parseSVG(icon(name))
      expect(fills).toHaveLength(1)
      expect(fills[0]!.color).toEqual({ r: 0, g: 0, b: 0, a: 1 })
      expect(fills[0]!.rule).toBe('evenodd')
    }
  })

  it('registerShape accepts both icons: non-degenerate handle bounds and built bands', () => {
    const set = new SlugShapeSet()
    for (const name of ['activity', 'circle']) {
      const parsed = parseSVG(icon(name))
      const handle = set.registerShape(parsed.shapes[0]!)
      expect(handle.bounds.xMax - handle.bounds.xMin).toBeGreaterThan(0.5)
      expect(handle.bounds.yMax - handle.bounds.yMin).toBeGreaterThan(0.5)
      expect(handle.bands.hBands.length).toBeGreaterThan(0)
      expect(handle.bands.vBands.length).toBeGreaterThan(0)
      expect(handle.curves.length).toBeGreaterThan(10)
    }
    expect(set.shapeCount).toBe(2)
  })
})
