---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner gem accents

**`StatsBanner` (`docs/src/components/StatsBanner.astro`)**

- Re-enabled the `color` prop on each `StatItem` — it was previously accepted but silently ignored, causing all stats to render in `--foreground`
- `color` now accepts any gem name (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) or a legacy color alias (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`); legacy names map to gems via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Resolved gem sets a per-stat `--stat-accent` CSS custom property inline; stat value text is `color-mix(in oklab, --stat-accent 65%, --foreground)` with a matching `text-shadow` glow for legibility
- Each stat gains a gem-tinted hairline underline (CSS `background-image` gradient, 1.5 px, fading to transparent toward the right) — the four stats read as a colored chord across the row
- `data-gem` attribute added to each `.stat-item` for potential CSS or JS targeting

**`README.md` (`packages/three-flatland/README.md`)**

- Renamed section heading "Why three-flatland?" to "Why Flatland?" to align with the brand naming convention (visual mark uses the short form)

Existing MDX call sites that pass legacy color names (`cyan`, `blue`, etc.) continue to compile and now render correctly — no changes required at call sites.

The `StatsBanner` now renders four visually distinct, gem-accented stats instead of a flat monochrome row.
