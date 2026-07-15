/**
 * `loadSvg` (`components/svg.ts`) registers every distinct SVG source into
 * ONE shared `SlugShapeSet` (`svg/shape-set.ts`) instead of minting a fresh
 * set per source — the fix for uikit-bento's 26-draw-call regression, where
 * `ShapeGroupManager` (keyed by `SlugShapeSet` identity) never saw two icons
 * share a set. happy-dom shims `DOMParser` for `parseSVG` under Node, same
 * pattern as `packages/slug/src/svg/parseSVG.lucide.test.ts`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { SlugShapeSet } from '@three-flatland/slug'
import { loadSvg } from '../components/svg.js'
import { getSharedShapeSet, setSharedShapeSet, svgCache } from '../svg/shape-set.js'

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

afterEach(() => {
  svgCache.clear()
})

const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="black"/></svg>'
const CIRCLE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="black"/></svg>'

describe('shared SlugShapeSet across Svg sources', () => {
  it('two different inline SVG sources register into the SAME shared set', async () => {
    const square = await loadSvg({ content: SQUARE })
    const circle = await loadSvg({ content: CIRCLE })
    expect(square?.set).toBe(getSharedShapeSet())
    expect(circle?.set).toBe(getSharedShapeSet())
    expect(square?.set).toBe(circle?.set)
  })

  it('same-source dedupe still holds: identical content twice resolves to the same registration', async () => {
    // `loadSvg` is an `async function`, so each call site gets its own
    // Promise wrapper — the real dedupe invariant is the cached promise
    // underneath resolving to the SAME `RegisteredSVG` (one parse, not two).
    const first = await loadSvg({ content: SQUARE })
    const second = await loadSvg({ content: SQUARE })
    expect(first).toBe(second)
  })

  it('setSharedShapeSet clears the cache so a re-load registers into the new set', async () => {
    const before = await loadSvg({ content: SQUARE })
    expect(before?.set).toBe(getSharedShapeSet())

    const nextSet = new SlugShapeSet()
    setSharedShapeSet(nextSet)
    expect(getSharedShapeSet()).toBe(nextSet)

    const after = await loadSvg({ content: SQUARE })
    expect(after?.set).toBe(nextSet)
    expect(after?.set).not.toBe(before?.set)
  })
})
