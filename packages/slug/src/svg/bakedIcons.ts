import type { SlugShapeHandle, SlugShapeSet } from '../SlugShapeSet.js'
import type { RegisteredSVG } from './loadSVG.js'
import type { ParsedSVGFill, SVGViewBox } from './parseSVG.js'

/**
 * One baked icon's entry in `SlugShapeSet.meta.icons` — written by
 * `uikit-bake icons` (`packShapeSet(set, { icons })`), read by
 * {@link iconFromBaked}. `handles` are shape ids into the same set.
 */
export interface BakedIconEntry {
  handles: number[]
  fills: ParsedSVGFill[]
  viewBox: SVGViewBox
}

/** Shape of `SlugShapeSet.meta` for an icon atlas. */
export interface BakedIconsMeta {
  icons: Record<string, BakedIconEntry>
}

/** Read `set.meta` as an icon atlas, or `undefined` if it isn't one. */
function iconsMeta(set: SlugShapeSet): Record<string, BakedIconEntry> | undefined {
  return (set.meta as Partial<BakedIconsMeta> | undefined)?.icons
}

/** Every icon name baked into `set`'s meta (empty for a non-atlas set). */
export function iconNamesFromBaked(set: SlugShapeSet): string[] {
  return Object.keys(iconsMeta(set) ?? {})
}

/**
 * Resolve a baked icon by name into the same `RegisteredSVG` shape the
 * runtime `slug/svg` path produces (`loadSVG.ts`'s `RegisteredSVG`) — the
 * icon's handles are looked up in `set` itself, no SVG parsing involved.
 *
 * Returns `undefined` when `name` isn't in `set.meta.icons` (unknown icon,
 * or `set` isn't a baked atlas). Throws when the atlas IS corrupt or stale:
 * a handle id with no matching shape in `set`, or an entry baked before
 * `viewBox` was added to the meta (D4) — re-bake with a newer `uikit-bake`.
 */
export function iconFromBaked(set: SlugShapeSet, name: string): RegisteredSVG | undefined {
  const entry = iconsMeta(set)?.[name]
  if (!entry) return undefined

  if (!entry.viewBox) {
    throw new Error(
      `iconFromBaked: icon "${name}" has no viewBox in its baked meta — re-bake with a newer uikit-bake`
    )
  }

  const handles: SlugShapeHandle[] = entry.handles.map((id) => {
    const handle = set.getShape(id)
    if (!handle) {
      throw new Error(
        `iconFromBaked: icon "${name}" references dangling shape handle ${id} — corrupt atlas`
      )
    }
    return handle
  })

  return { set, handles, fills: entry.fills, viewBox: entry.viewBox }
}
