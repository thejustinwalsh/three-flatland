/**
 * Compact single-row renderer stats blade.
 *
 * Five equal-width cells separated by dim vertical dividers:
 *   `✎ 3 | △ 10K | ◇ 42 | ⌂ 12 | ▦ 3`
 *
 * Each cell shows an outline icon on the left and a left-aligned,
 * compact-formatted number on the right. A native `title=` tooltip on each
 * cell exposes the full field name. Injected via the same "replace a
 * separator blade's content" trick that `stats-graph.ts` uses, so the blade
 * still gets a proper slot in the blade rack.
 */

import type { FolderApi, Pane } from 'tweakpane'

export interface StatsRowValues {
  draws?: number
  tris?: number
  /** Points + lines aggregated — most examples will show 0 here. */
  prims?: number
  geoms?: number
  textures?: number
}

export interface StatsRowHandle {
  readonly element: HTMLElement
  update(values: StatsRowValues): void
  dispose(): void
}

// ── Icons ────────────────────────────────────────────────────────────────
// Outline glyphs, stroked with currentColor so they inherit theme vars.
// Sized to `calc(1em - 1px)` (→ 11px at the row's 12px font-size), which
// lines up with the digit cap-height without looking too tall. Every path
// fills a `(1,1)–(13,13)` box inside the 14×14 viewBox so all icons share
// the same visual footprint.

const ICON_ATTRS =
  'viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:calc(1em - 1px);height:calc(1em - 1px)"'

const ICONS: Record<keyof Required<StatsRowValues>, string> = {
  // Pencil — diagonal parallelogram body with a ferrule band near the eraser
  draws: `<svg ${ICON_ATTRS}><path d="M1 13 L3 13 L13 3 L11 1 L1 11 Z"/><path d="M9 3 L11 5"/></svg>`,
  // Isoceles triangle stretched to fill the 12×12 box
  tris: `<svg ${ICON_ATTRS}><path d="M7 1 L13 13 L1 13 Z"/></svg>`,
  // Square (aggregated lines + points)
  prims: `<svg ${ICON_ATTRS}><path d="M1 1 L13 1 L13 13 L1 13 Z"/></svg>`,
  // Regular-ish pentagon (dodecahedron silhouette), y-scaled to fill the box
  geoms: `<svg ${ICON_ATTRS}><path d="M7 1 L13 5.6 L10.7 13 L3.3 13 L1 5.6 Z"/></svg>`,
  // 3×3 dot grid (filled — swap stroke→fill). Centers spread so outer dot
  // edges touch the same (1,1)–(13,13) box as the other icons.
  textures: `<svg viewBox="0 0 14 14" fill="currentColor" style="display:block;width:calc(1em - 1px);height:calc(1em - 1px)"><circle cx="2.1" cy="2.1" r="1.1"/><circle cx="7" cy="2.1" r="1.1"/><circle cx="11.9" cy="2.1" r="1.1"/><circle cx="2.1" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/><circle cx="11.9" cy="7" r="1.1"/><circle cx="2.1" cy="11.9" r="1.1"/><circle cx="7" cy="11.9" r="1.1"/><circle cx="11.9" cy="11.9" r="1.1"/></svg>`,
}

const TOOLTIPS: Record<keyof Required<StatsRowValues>, string> = {
  draws: 'Draw Calls',
  tris: 'Triangles',
  prims: 'Primitives (lines + points)',
  geoms: 'Geometries',
  textures: 'Textures',
}

// ── Compact number formatting ────────────────────────────────────────────
// Always produces exactly 4 characters (short values are right-padded with
// non-breaking spaces so every cell renders a stable 4-char slot). Auto-
// scales through K / M / B / T suffixes so triangle counts (the widest-
// ranging stat — can hit hundreds of millions) stay legible without
// widening the row.

const COMPACT_UNITS = ['K', 'M', 'B', 'T']
const NBSP = '\u00A0'

function pad4(s: string): string {
  return s.length >= 4 ? s : s + NBSP.repeat(4 - s.length)
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n < 0) return pad4('0')
  if (n < 1000) return pad4(String(Math.round(n)))

  let unit = 0
  let val = n / 1000
  while (val >= 1000 && unit < COMPACT_UNITS.length - 1) {
    val /= 1000
    unit++
  }

  // val ∈ [1, 1000). Under 10 shows one decimal ("1.2K" / "9.9K"); 10+
  // rounds to integer ("10K" / "999K"). If the integer would overflow
  // into the next magnitude (e.g. 999.5 → 1000), promote one unit as
  // "1.0X" so the output never grows beyond 4 characters.
  if (val < 9.95) return pad4(val.toFixed(1) + COMPACT_UNITS[unit])
  const rounded = Math.round(val)
  if (rounded >= 1000 && unit < COMPACT_UNITS.length - 1) {
    return pad4('1.0' + COMPACT_UNITS[unit + 1])
  }
  return pad4(String(rounded) + COMPACT_UNITS[unit])
}

// ── One-time <style> injection for divider pseudo-elements ───────────────
// Pseudo-elements can't be set via inline style attributes, so we inject a
// single stylesheet the first time `addStatsRow` runs. Uses a `data-*`
// marker so repeat calls are idempotent.

const STYLE_MARKER = 'data-tp-flatland-statsrow'
const CELL_CLASS = 'tp-flatland-statsrow-cell'

function injectStyles(): void {
  if (document.querySelector(`style[${STYLE_MARKER}]`)) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_MARKER, '')
  style.textContent = `
    .${CELL_CLASS} { position: relative; }
    .${CELL_CLASS} + .${CELL_CLASS}::before {
      content: '';
      position: absolute;
      left: 0;
      top: 3px;
      bottom: 3px;
      width: 1px;
      background: var(--tp-groove-foreground-color, rgba(240, 237, 216, 0.12));
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

// ── Blade construction ──────────────────────────────────────────────────

export function addStatsRow(parent: Pane | FolderApi): StatsRowHandle {
  injectStyles()

  // Use a separator blade as a slot so ordering plays nicely with the rack,
  // then nuke its content and drop in our own layout.
  const blade = parent.addBlade({ view: 'separator' }) as unknown as {
    element: HTMLElement
    dispose(): void
  }
  const bladeEl = blade.element
  bladeEl.innerHTML = ''
  bladeEl.className = 'tp-cntv'
  bladeEl.style.cssText = ''

  const row = document.createElement('div')
  row.style.cssText = [
    // Five equal columns spanning the full blade width. Dividers between
    // cells are drawn by a `::before` pseudo-element on every cell after
    // the first (see injectStyles). Row padding is intentionally tight
    // (4px) because each column has only ~50px to fit a 4-char value plus
    // an icon — shaving 2px per side here gives the triangles cell enough
    // headroom for "999K" / "1.2M" without clipping.
    'display:grid',
    'grid-template-columns:repeat(5,1fr)',
    'align-items:center',
    'height:calc(var(--cnt-usz, 20px) * 1.1)',
    'padding:0 4px',
    'font-size:12px',
    'line-height:1',
    'font-family:var(--tp-base-font-family, ui-monospace, monospace)',
    'font-variant-numeric:tabular-nums',
    'color:var(--tp-monitor-foreground-color)',
  ].join(';')

  const keys = ['draws', 'textures', 'geoms', 'prims', 'tris'] as const
  const valueEls = {} as Record<(typeof keys)[number], HTMLSpanElement>

  for (const key of keys) {
    const cell = document.createElement('div')
    cell.className = CELL_CLASS
    cell.title = TOOLTIPS[key]
    // Left-aligned icon + number. `padding-left: 6px` leaves breathing room
    // between the divider line and the icon; `gap: 3px` keeps the icon tight
    // against the number. Both are tuned to fit a 4-char value in the
    // narrowest cell (~49px) without clipping. `user-select: none` (plus
    // vendor prefixes for Safari/Firefox) so stats aren't accidentally
    // selectable or copyable — they're a readout, not content.
    cell.style.cssText =
      'display:flex;align-items:center;gap:3px;padding-left:6px;overflow:hidden;white-space:nowrap;user-select:none;-webkit-user-select:none;-moz-user-select:none'

    const iconWrap = document.createElement('span')
    // Tooltip also attached here so hovering the icon (not just the number)
    // surfaces the field name. Bottom-aligned + shifted up 1px pins the
    // icon bottom to the digit baseline.
    iconWrap.title = TOOLTIPS[key]
    iconWrap.style.cssText =
      'display:inline-flex;flex-shrink:0;color:var(--tp-label-foreground-color);align-self:flex-end;transform:translateY(-1px)'
    iconWrap.innerHTML = ICONS[key]
    cell.appendChild(iconWrap)

    // Value slot reserves 4 chars of width — `formatCompact` always emits
    // exactly 4 chars (padded with NBSP) so the icon stays planted. Title
    // mirrored here so the tooltip shows over the number too.
    const valueEl = document.createElement('span')
    valueEl.title = TOOLTIPS[key]
    valueEl.textContent = `0${NBSP}${NBSP}${NBSP}`
    valueEl.style.cssText = 'min-width:4ch;text-align:left;flex-shrink:0'
    cell.appendChild(valueEl)

    row.appendChild(cell)
    valueEls[key] = valueEl
  }

  bladeEl.appendChild(row)

  // Keep a local cache so callers can pass partial updates without
  // clobbering fields they don't know about.
  const state: Required<StatsRowValues> = {
    draws: 0,
    tris: 0,
    prims: 0,
    geoms: 0,
    textures: 0,
  }

  return {
    element: bladeEl,
    update(values) {
      if (values.draws !== undefined && values.draws !== state.draws) {
        state.draws = values.draws
        valueEls.draws.textContent = formatCompact(values.draws)
      }
      if (values.tris !== undefined && values.tris !== state.tris) {
        state.tris = values.tris
        valueEls.tris.textContent = formatCompact(values.tris)
      }
      if (values.prims !== undefined && values.prims !== state.prims) {
        state.prims = values.prims
        valueEls.prims.textContent = formatCompact(values.prims)
      }
      if (values.geoms !== undefined && values.geoms !== state.geoms) {
        state.geoms = values.geoms
        valueEls.geoms.textContent = formatCompact(values.geoms)
      }
      if (values.textures !== undefined && values.textures !== state.textures) {
        state.textures = values.textures
        valueEls.textures.textContent = formatCompact(values.textures)
      }
    },
    dispose() {
      blade.dispose()
    },
  }
}
