/**
 * `installIconAtlas` + `Svg`'s `icon` prop (`components/svg.ts`, D3 — NOT
 * `name`, `Object3D.name` collides). Baked icons resolve through
 * `iconFromBaked` with **zero SVG parsing** — this file leaves the global
 * `DOMParser` unset for the baked-path assertions to prove that; the
 * runtime-fallback test installs the happy-dom shim (same pattern as
 * `svg-shared-set.test.ts` / `packages/slug/src/svg/parseSVG.lucide.test.ts`)
 * only once it actually needs a parse.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { SlugShapeSet } from '@three-flatland/slug'
import { packShapeSet } from '@three-flatland/slug/bake'
import { lineToQuadratic } from '@three-flatland/slug/pipeline'
import type { QuadContour } from '@three-flatland/slug'
import { loadSvg } from '../components/svg.js'
import {
  getInstalledAtlasNames,
  getSharedShapeSet,
  installIconAtlas,
  setSharedShapeSet,
  svgCache,
} from '../svg/shape-set.js'

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

function installDomParserShim(): void {
  const win = new Window()
  class ShimDOMParser {
    parseFromString(text: string, type: string): Document {
      const doc = new win.DOMParser().parseFromString(text, type as 'image/svg+xml')
      if (doc.documentElement) patchStyles(doc.documentElement as unknown as StylePatchable)
      return doc as unknown as Document
    }
  }
  vi.stubGlobal('DOMParser', ShimDOMParser)
}

function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** A one-icon atlas, shaped exactly like `uikit-bake icons` (post-U3) writes it. */
async function buildAtlas(): Promise<SlugShapeSet> {
  const set = new SlugShapeSet()
  const activity = set.registerShape([rect(0, 0, 1, 1)])

  const meta = {
    icons: {
      activity: {
        handles: [activity.glyphId],
        fills: [{ color: { r: 0, g: 0, b: 0, a: 1 }, rule: 'nonzero' }],
        viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      },
    },
  }

  const glb = await packShapeSet(set, meta)
  return SlugShapeSet.fromBaked(toArrayBuffer(glb))
}

const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="black"/></svg>'

describe('installIconAtlas + icon resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    svgCache.clear()
    setSharedShapeSet(new SlugShapeSet())
  })

  it('installs a SlugShapeSet directly as the shared set', async () => {
    const atlas = await buildAtlas()
    await installIconAtlas(atlas)
    expect(getSharedShapeSet()).toBe(atlas)
    expect(getInstalledAtlasNames()).toEqual(['activity'])
  })

  it('loadSvg({icon}) resolves a baked icon with NO DOMParser call', async () => {
    // The global `DOMParser` is intentionally left unset for this test —
    // if the baked path touched it, this assertion (and every other test in
    // this file that runs before the runtime-fallback test below) would
    // throw `DOMParser is not defined` instead of resolving.
    expect(globalThis.DOMParser).toBeUndefined()

    const atlas = await buildAtlas()
    await installIconAtlas(atlas)

    const registered = await loadSvg({ icon: 'activity' })
    expect(registered).toBeDefined()
    expect(registered!.set).toBe(getSharedShapeSet())
    expect(registered!.fills).toEqual([{ color: { r: 0, g: 0, b: 0, a: 1 }, rule: 'nonzero' }])
    expect(registered!.viewBox).toEqual({ minX: 0, minY: 0, width: 24, height: 24 })
  })

  it('caches the baked resolution under a namespaced icon key', async () => {
    const atlas = await buildAtlas()
    await installIconAtlas(atlas)

    const first = await loadSvg({ icon: 'activity' })
    const second = await loadSvg({ icon: 'activity' })
    expect(first).toBe(second)
    expect(svgCache.has(JSON.stringify(['icon', 'activity']))).toBe(true)
    // The old un-namespaced `icon:<name>` key collided with src/content keys.
    expect(svgCache.has('icon:activity')).toBe(false)
  })

  it('namespaces cache keys so an icon name cannot collide with a src/content string', async () => {
    installDomParserShim()
    const atlas = await buildAtlas()
    await installIconAtlas(atlas)

    const baked = await loadSvg({ icon: 'activity' })
    // Under the old cache, a content of "icon:activity" keyed identically to the
    // baked icon and silently returned it. It must be treated as content now.
    let asContent: unknown
    try {
      asContent = await loadSvg({ content: 'icon:activity' })
    } catch {
      asContent = undefined // a parse failure still proves it didn't hit the baked cache
    }
    expect(asContent).not.toBe(baked)
  })

  describe('runtime fallback (icon not in atlas, src/content given)', () => {
    beforeAll(() => {
      installDomParserShim()
    })

    afterAll(() => {
      vi.unstubAllGlobals()
    })

    it('registers into the SAME shared set as the baked path', async () => {
      const atlas = await buildAtlas()
      await installIconAtlas(atlas)

      const fallback = await loadSvg({ icon: 'not-in-atlas', content: SQUARE })
      expect(fallback).toBeDefined()
      expect(fallback!.set).toBe(getSharedShapeSet())
      expect(fallback!.set).toBe(atlas)
    })
  })

  it('throws a descriptive error for an unknown icon with no src/content fallback', async () => {
    const atlas = await buildAtlas()
    await installIconAtlas(atlas)

    await expect(loadSvg({ icon: 'does-not-exist' })).rejects.toThrow(/does-not-exist/)
    await expect(loadSvg({ icon: 'does-not-exist' })).rejects.toThrow(/activity/)
  })

  it('names the "no atlas installed" case when the shared set has no icon meta', async () => {
    await expect(loadSvg({ icon: 'activity' })).rejects.toThrow(/installIconAtlas/)
  })
})
