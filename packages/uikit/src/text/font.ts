import {
  any as anySchema,
  custom,
  enum as enumSchema,
  number,
  partialRecord,
  record,
  string,
  union,
} from 'zod'
import type { z } from 'zod'
import { computed, effect, signal } from '@preact/signals-core'
import type { Signal } from '@preact/signals-core'
import { getGlyphTopOffset, type SlugFont } from '@three-flatland/slug'
import { loadCachedFont } from './cache.js'
import type { Properties } from '../properties/index.js'
import type { Container } from '../components/container.js'
import { isNumberString, type NumberString } from '../properties/values.js'
import { defineSchema } from '../properties/schema.js'

export const fontWeightNames = {
  thin: 100,
  'extra-light': 200,
  light: 300,
  normal: 400,
  medium: 500,
  'semi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  black: 900,
  'extra-black': 950,
} as const

const numberStringSchema = /* @__PURE__ */ defineSchema(() =>
  custom<NumberString>(isNumberString, 'Expected a number string')
)
const namedFontWeightSchema = /* @__PURE__ */ defineSchema(() =>
  enumSchema(
    Object.keys(fontWeightNames) as [
      keyof typeof fontWeightNames,
      ...(keyof typeof fontWeightNames)[],
    ]
  )
)
const fontWeightKeySchema = /* @__PURE__ */ defineSchema(() =>
  union([namedFontWeightSchema, numberStringSchema])
)

export const FontWeightSchema = /* @__PURE__ */ defineSchema(() =>
  union([number(), namedFontWeightSchema, numberStringSchema])
)

export type FontWeight = z.input<typeof FontWeightSchema>

/**
 * The layout-metric contract MSDF's `Font`/`GlyphInfo` used to expose,
 * trimmed to what `text/layout` and `text/wrapper` actually consume (see
 * `text/utils.ts` `getGlyphOffsetX/Y`, `getOffsetToNextGlyph`,
 * `getKerningOffset`). All fields are ratios of `fontSize` — multiply by
 * `fontSize` at the call site, exactly as before. The MSDF-only render
 * fields (`uvX/uvY/uvWidth/uvHeight`, `page`, `pageWidth/pageHeight`,
 * `distanceRange`, `renderSolid`) die with the atlas — Slug needs none of
 * them (`text/render/**` reads `SlugFont`/`SlugGlyphData` directly).
 */
export type GlyphInfo = {
  /** Glyph ID — kerning-lookup identity, and the id `SlugBatch.writeGlyph` needs. */
  id: number
  /** Left-side-bearing before ink starts (glyph advertised `lsb`), ratio of `fontSize`. */
  xoffset: number
  /**
   * Downward offset from the line-box top to the glyph's ink top, ratio of
   * `fontSize`. MSDF folded this into its baked `yoffset`; Slug doesn't —
   * this is `ascender - bounds.yMax`, the inner term of slug's
   * `getGlyphTopOffset(ascender, yMax, 1, 1)` (R4: routed through slug's
   * `layout/baseline.ts`, not re-derived here).
   */
  yoffset: number
  /** Ink width (`bounds.xMax - bounds.xMin`), ratio of `fontSize`. */
  width: number
  /** Advance to the next glyph's pen position, ratio of `fontSize`. */
  xadvance: number
}

/**
 * A font family's weight entry. MSDF accepted a URL/object pointing at a
 * BMFont JSON atlas; the fork points at a TTF/OTF (runtime-shaped, D3
 * ruling) or a pre-baked `.slug.glb`, loaded via `SlugFontLoader` — or an
 * already-loaded `SlugFont` for callers who manage loading themselves.
 */
export type FontInfoSource =
  | string
  | SlugFont
  | (() => string | SlugFont | Promise<string | SlugFont>)

const fontFamilyWeightMapEntrySchema = /* @__PURE__ */ defineSchema(
  () => anySchema() as z.ZodType<FontInfoSource, FontInfoSource>
)

export const FontFamilyWeightMapSchema = /* @__PURE__ */ defineSchema(() =>
  partialRecord(fontWeightKeySchema, fontFamilyWeightMapEntrySchema)
)

export type FontFamilyWeightMap = z.input<typeof FontFamilyWeightMapSchema>

export const FontFamiliesSchema = /* @__PURE__ */ defineSchema(() =>
  record(string(), FontFamilyWeightMapSchema)
)

export type FontFamilies = z.input<typeof FontFamiliesSchema>

export type FontFamilyProperties = {
  fontFamily?: string
  fontWeight?: FontWeight
  fontFamilies?: FontFamilies
}

// PROVISIONAL — pending stakeholder ruling D5 (design spec §14), taking the
// spec's recommended option (a): bundle ONE weight of Inter (~325 KB,
// runtime-parsed via SlugFontLoader — NOT pre-baked, consistent with the D3
// ruling that runtime parsing is the default path). This restores upstream's
// zero-config `Text` UX (`@pmndrs/msdfonts`'s bundled default) without
// reintroducing MSDF. Trivially reversible: delete this block (and the
// bundled .ttf + its tsup copy step) to fall back to "no default, callers
// must pass `fontFamilies` explicitly" if D5 rules otherwise.
const defaultInterUrl = /* @__PURE__ */ new URL('./assets/Inter-Regular.ttf', import.meta.url).href
const defaultFontFamiles: FontFamilies = {
  inter: { normal: defaultInterUrl },
}

export function computedFontFamilies(
  properties: Properties,
  parent: Signal<Container | undefined>
) {
  return computed(() => {
    const currentFontFamilies = properties.value.fontFamilies
    const inheritedFontFamilies = parent.value?.fontFamilies.value
    if (inheritedFontFamilies == null) {
      return currentFontFamilies
    }
    if (currentFontFamilies == null) {
      return inheritedFontFamilies
    }
    return {
      ...inheritedFontFamilies,
      ...currentFontFamilies,
    }
  })
}

export function computedFont(
  properties: Properties,
  fontFamiliesSignal: Signal<FontFamilies | undefined>
): Signal<Font | undefined> {
  const result = signal<Font | undefined>(undefined)
  effect(() => {
    if (!properties.enabled.value) {
      return
    }
    let fontWeight: FontWeight = properties.value.fontWeight
    if (typeof fontWeight === 'string') {
      fontWeight = parseFloat(fontWeight)
      if (isNaN(fontWeight)) {
        fontWeight = properties.value.fontWeight
        if (!(fontWeight in fontWeightNames)) {
          throw new Error(`unknown font weight "${fontWeight}"`)
        }
        fontWeight = fontWeightNames[fontWeight as keyof typeof fontWeightNames]
      }
    }
    let fontFamily = properties.value.fontFamily
    const fontFamilies = fontFamiliesSignal.value ?? defaultFontFamiles
    fontFamily ??= Object.keys(fontFamilies)[0]!
    let fontFamilyWeightMap = fontFamilies[fontFamily]
    if (fontFamilyWeightMap == null) {
      const availableFontFamilyList = Object.keys(fontFamilies)
      fontFamilyWeightMap = fontFamilies[availableFontFamilyList[0] as any]!
      console.error(
        `unknown font family "${fontFamily}". Available font families are ${availableFontFamilyList.map((name) => `"${name}"`).join(', ')}. Falling back to "${availableFontFamilyList[0]}".`
      )
    }
    const url = getMatchingFontUrl(fontFamilyWeightMap, fontWeight)
    let aborted = false
    loadCachedFont(url, (font) => !aborted && (result.value = font))
    return () => (aborted = true)
  })
  return result
}

function getMatchingFontUrl(fontFamily: FontFamilyWeightMap, weight: number): FontInfoSource {
  let distance = Infinity
  let result: FontInfoSource | undefined
  for (const fontWeight of Object.keys(fontFamily) as Array<keyof FontFamilyWeightMap>) {
    const d = Math.abs(weight - getWeightNumber(fontWeight))
    if (d === 0) {
      return fontFamily[fontWeight]!
    }
    if (d < distance) {
      distance = d
      result = fontFamily[fontWeight]
    }
  }
  if (result == null) {
    throw new Error(`font family has no entries ${JSON.stringify(fontFamily)}`)
  }
  return result
}

function getWeightNumber(value: string): number {
  if (value in fontWeightNames) {
    return fontWeightNames[value as keyof typeof fontWeightNames]
  }
  const number = parseFloat(value)
  if (isNaN(number)) {
    throw new Error(`invalid font weight "${value}"`)
  }
  return number
}

const MISSING_GLYPH: GlyphInfo = {
  id: -1,
  xoffset: 0,
  yoffset: 0.3,
  width: 0.5,
  xadvance: 0.6,
} as const

/**
 * Thin wrapper over a `SlugFont`, preserving the layout-metric contract
 * (`getGlyphInfo`/`getKerning`) that `text/layout`, `text/wrapper`, and
 * `text/utils.ts` already consume — those modules are renderer-agnostic and
 * unchanged by the Slug uplift (spec §8.2). `text/render/**` reads the
 * underlying `slug` (a real `SlugFont`) directly instead of going through
 * this wrapper — glyph groups are keyed by `SlugFont`, not `Font`.
 */
export class Font {
  constructor(public readonly slug: SlugFont) {}

  getGlyphInfo(char: string): GlyphInfo {
    let codepoint = char.codePointAt(0)
    let metrics = codepoint == null ? undefined : this.slug.getGlyphMetrics(codepoint)
    if (metrics == null && char === '\n') {
      // MSDF folded a missing "\n" glyph onto the space glyph — `positioned.ts`'s
      // char walk includes each line's trailing terminator, so this fallback
      // keeps that behavior rather than warning on every wrapped line.
      codepoint = ' '.codePointAt(0)
      metrics = codepoint == null ? undefined : this.slug.getGlyphMetrics(codepoint)
    }
    if (metrics == null) {
      console.warn(`Missing glyph info for character "${char}"`)
      return MISSING_GLYPH
    }
    return {
      id: metrics.glyphId,
      xoffset: metrics.lsb,
      yoffset: getGlyphTopOffset(this.slug.ascender, metrics.bounds.yMax, 1, 1),
      width: metrics.bounds.xMax - metrics.bounds.xMin,
      xadvance: metrics.advanceWidth,
    }
  }

  getKerning(firstId: number, secondId: number): number {
    return this.slug.getKerning(firstId, secondId)
  }
}
