/**
 * Gem-background system — single source of truth.
 *
 * Edit this file to adjust gem assignments, then run `pnpm sync:examples`
 * (or just `pnpm sync:examples --verify` in CI) to propagate changes into
 * every example's `gem.ts` and the docs `example-gems.ts` lookup table.
 *
 * - `GEM_ORDER`: canonical cycle. Examples are assigned by alphabetical
 *   index modulo the cycle length.
 * - `GEM_OVERRIDES`: explicit per-slug overrides. `null` opts the example
 *   out of gem treatment entirely (currently unused — knightmark/skia
 *   compose layers differently in their entry files but still receive
 *   a gem assignment).
 * - `GEM_COLORS`: hex resolution of each gem. Mirrors the dark-theme
 *   `--<gem>` values in `packages/starlight-theme/styles/theme.css`,
 *   converted from OKLCH to sRGB hex. If theme tokens shift, regenerate
 *   these via the same conversion (see scripts/sync-examples.ts header
 *   for the formula).
 */

export const GEM_ORDER = [
  'diamond',
  'emerald',
  'gold',
  'amethyst',
  'ruby',
  'pink',
  'salmon',
  'turquoize',
] as const

export type Gem = (typeof GEM_ORDER)[number]

export const GEM_OVERRIDES: Record<string, Gem | null> = {
  // Add per-slug pins here when auto-assignment lands wrong.
  // Example:
  //   knightmark: 'salmon',
}

export const GEM_COLORS: Record<Gem, string> = {
  diamond: '#00c4e9',
  emerald: '#00c38b',
  gold: '#d29a00',
  amethyst: '#995bff',
  ruby: '#eb3c67',
  pink: '#e875c6',
  salmon: '#f3562e',
  turquoize: '#2bd2c2',
}

/**
 * Resolve a gem assignment for an example slug given its position in the
 * sorted slug list. Used by `scripts/sync-examples.ts`.
 */
export function gemForExample(slug: string, sortedIndex: number): Gem | null {
  if (slug in GEM_OVERRIDES) return GEM_OVERRIDES[slug]
  return GEM_ORDER[sortedIndex % GEM_ORDER.length]
}
