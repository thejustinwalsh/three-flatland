/**
 * Real-icon equivalence test for the SVG shape-set bake/runtime paths.
 *
 * Pipeline A (runtime): real lucide files (`packages/uikit-lucide/icons/`)
 * loaded through `loadSVGShapes` into one shared `SlugShapeSet`, exactly
 * like `uikit`'s `loadSvg` seam (post-U1) accumulates icons.
 *
 * Pipeline B (baked): the SAME set packed via `packShapeSet` with
 * U3-shaped `meta.icons[name] = { handles, fills, viewBox }` (the 3-line
 * step `uikit-bake icons` performs — replicated here, not imported, to
 * respect the slug/uikit package boundary), reloaded via
 * `SlugShapeSet.fromBaked`, and resolved per icon via `iconFromBaked`.
 *
 * Unlike the font pipeline (`baked.equivalence.test.ts`, approximately
 * equivalent — notdef fallback, outline-presence inference), shapes are
 * **bit-exact by construction**: `registerShape` snaps every control point
 * to float32 at registration (`SlugShapeSet.ts`), and the baked format is
 * geometry-complete (curves + contourStarts + prebuilt bands), so nothing
 * is inferred or approximated on reload. Every assertion below uses plain
 * deep equality — `closeTo` anywhere here would hide a real regression.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { loadSVGShapes } from './loadSVG'
import type { RegisteredSVG } from './loadSVG'
import { iconFromBaked } from './bakedIcons'
import type { BakedIconEntry, BakedIconsMeta } from './bakedIcons'
import { packShapeSet } from '../bake'
import { SlugShapeSet } from '../SlugShapeSet'
import { lineToQuadratic } from '../pipeline/fontParser'
import type { QuadContour } from '../types'

// ---------------------------------------------------------------------------
// happy-dom DOMParser shim — same pattern as parseSVG.lucide.test.ts.
// `parseSVG` runs three's `SVGLoader.parse`, which needs a `DOMParser`
// global (present in browsers, absent in plain Node), and happy-dom's
// `CSSStyleDeclaration` reads `undefined` for an unset property where a
// browser reads `''`, which crashes `SVGLoader`'s style scraping.
// ---------------------------------------------------------------------------

interface StylePatchable {
  style?: object
  children?: Iterable<StylePatchable>
}

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

// ---------------------------------------------------------------------------
// Fixtures — real lucide files, basename-sorted (D6), read from source.
// ---------------------------------------------------------------------------

const ICON_NAMES = ['activity', 'circle', 'menu', 'settings', 'x']

const icon = (name: string): string =>
  readFileSync(new URL(`../../../uikit-lucide/icons/${name}.svg`, import.meta.url), 'utf8')

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** A closed rectangle contour, for the post-load-growth shape below. */
function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

// ---------------------------------------------------------------------------
// Shared state — built once for the whole suite.
// ---------------------------------------------------------------------------

let setA: SlugShapeSet // pipeline A: runtime parse, one shared set
let setB: SlugShapeSet // pipeline B: packShapeSet(setA, meta) -> fromBaked
let runtimeByName: Map<string, RegisteredSVG>

beforeAll(async () => {
  setA = new SlugShapeSet()
  runtimeByName = new Map()
  const icons: Record<string, BakedIconEntry> = {}

  for (const name of ICON_NAMES) {
    const registered = await loadSVGShapes(icon(name), setA)
    runtimeByName.set(name, registered)
    // The 3-line pack-with-meta step `uikit-bake icons` performs
    // (cli.ts `runIcons`) — replicated here rather than imported across
    // the slug/uikit package boundary.
    icons[name] = {
      handles: registered.handles.map((h) => h.glyphId),
      fills: registered.fills.map((f) => ({ color: { ...f.color }, rule: f.rule })),
      viewBox: { ...registered.viewBox },
    }
  }

  const meta: BakedIconsMeta = { icons }
  const glb = await packShapeSet(setA, meta as unknown as Record<string, unknown>)
  setB = SlugShapeSet.fromBaked(toArrayBuffer(glb))
})

// ---------------------------------------------------------------------------
// 1. Per-icon geometry parity — curves/contourStarts/bands/bounds bit-exact
// ---------------------------------------------------------------------------

function checkIconShapes(name: string): void {
  const runtime = runtimeByName.get(name)!
  const baked = iconFromBaked(setB, name)
  expect(baked, `${name}: baked icon missing`).toBeDefined()
  expect(baked!.handles).toHaveLength(runtime.handles.length)

  for (let i = 0; i < runtime.handles.length; i++) {
    const rt = runtime.handles[i]!
    const bk = baked!.handles[i]!
    expect(bk.curves, `${name}[${i}].curves`).toEqual(rt.curves)
    expect(bk.contourStarts, `${name}[${i}].contourStarts`).toEqual(rt.contourStarts)
    expect(bk.bands, `${name}[${i}].bands`).toEqual(rt.bands)
    expect(bk.bounds, `${name}[${i}].bounds`).toEqual(rt.bounds)
  }

  expect(baked!.fills, `${name}: fills`).toEqual(runtime.fills)
  expect(baked!.viewBox, `${name}: viewBox`).toEqual(runtime.viewBox)
}

describe('baked/runtime parity — real lucide icons (curves/contourStarts/bands/bounds, fills, viewBox)', () => {
  it('activity', () => checkIconShapes('activity'))
  it('circle', () => checkIconShapes('circle'))
  it('menu', () => checkIconShapes('menu'))
  it('settings', () => checkIconShapes('settings'))
  it('x', () => checkIconShapes('x'))
})

// ---------------------------------------------------------------------------
// 2. GPU texture parity — the two sets pack to bit-identical textures
// ---------------------------------------------------------------------------

describe('baked/runtime parity — curve/band textures are bit-identical', () => {
  it('curve texture (Uint16Array half-float control points)', () => {
    expect(Array.from(setB.curveTexture.image.data as Uint16Array)).toEqual(
      Array.from(setA.curveTexture.image.data as Uint16Array)
    )
  })

  it('band texture (Float32Array band headers + curve refs)', () => {
    expect(Array.from(setB.bandTexture.image.data as Float32Array)).toEqual(
      Array.from(setA.bandTexture.image.data as Float32Array)
    )
  })
})

// ---------------------------------------------------------------------------
// 3. Post-load growth — registering into the baked set never moves
//    previously-baked icons' texel locations or their packed data.
// ---------------------------------------------------------------------------

/** Flatten a (x, y) texel location to a linear texel index. */
function texelIndex(loc: { x: number; y: number }, width: number): number {
  return loc.y * width + loc.x
}

describe('baked set stays growable without disturbing previously baked icons', () => {
  it('a new shape registered after fromBaked leaves prior texel locations and data unchanged', () => {
    // Every shape currently in setB is one of the baked icons' handles —
    // ascending id order matches packTextures' insertion (and hence
    // packing) order (`fromBaked` inserts in the same ascending-id order
    // `packShapeSet` sorted into, per `SlugShapeSet.ts`'s growth-invariant
    // doc), so consecutive ids bound each other's texel span exactly.
    const oldIds = Array.from(setB.glyphs.keys()).sort((a, b) => a - b)
    const priorLocations = new Map(
      oldIds.map((id) => {
        const h = setB.getShape(id)!
        return [id, { curve: { ...h.curveLocation }, band: { ...h.bandLocation } }] as const
      })
    )
    const priorCurveData = Array.from(setB.curveTexture.image.data as Uint16Array)
    const priorBandData = Array.from(setB.bandTexture.image.data as Float32Array)

    // Register one more shape and force a repack.
    const newHandle = setB.registerShape([rect(0, 0, 0.3, 0.3)])
    void setB.curveTexture // triggers _ensurePacked

    const width = setB.textureWidth
    const newCurveData = Array.from(setB.curveTexture.image.data as Uint16Array)
    const newBandData = Array.from(setB.bandTexture.image.data as Float32Array)

    for (let i = 0; i < oldIds.length; i++) {
      const id = oldIds[i]!
      const handle = setB.getShape(id)!
      const prior = priorLocations.get(id)!

      // Location invariant: growth never moves a previously-packed shape.
      expect(handle.curveLocation, `id ${id} curveLocation`).toEqual(prior.curve)
      expect(handle.bandLocation, `id ${id} bandLocation`).toEqual(prior.band)

      // Payload invariant: this shape's own texel span — bounded by the
      // next shape's start (the newly-appended shape's start, for the
      // final old shape) — is bit-identical before and after growth. The
      // full prior array's tail beyond that span is legitimately unused
      // padding (rounded-up-to-power-of-2 texture height) that growth is
      // free to occupy, so it is deliberately excluded from this check.
      const nextId = i + 1 < oldIds.length ? oldIds[i + 1]! : undefined
      const nextCurveLoc =
        nextId !== undefined ? setB.getShape(nextId)!.curveLocation : newHandle.curveLocation
      const nextBandLoc =
        nextId !== undefined ? setB.getShape(nextId)!.bandLocation : newHandle.bandLocation

      const curveStart = texelIndex(handle.curveLocation, width) * 4
      const curveEnd = texelIndex(nextCurveLoc, width) * 4
      expect(newCurveData.slice(curveStart, curveEnd), `id ${id} curve payload`).toEqual(
        priorCurveData.slice(curveStart, curveEnd)
      )

      // Band texture is R32F — one float per texel (was RG, two).
      const bandStart = texelIndex(handle.bandLocation, width) * 1
      const bandEnd = texelIndex(nextBandLoc, width) * 1
      expect(newBandData.slice(bandStart, bandEnd), `id ${id} band payload`).toEqual(
        priorBandData.slice(bandStart, bandEnd)
      )
    }
  })
})
