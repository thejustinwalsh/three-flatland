---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: StatsBanner gem accent + README update

**`StatsBanner` (`docs/src/components/StatsBanner.astro`)**

- Re-enabled the `color` prop on each `StatItem` — it was previously marked `@deprecated` and silently ignored, causing all stats to render in `--foreground`
- `color` now accepts a `Gem` name or any legacy color string; legacy values are mapped to gems via the shared `legacyToGem` table (same mapping used by `FeatureCard` and `ValueProp`)
- `--stat-accent` CSS custom property is set per-stat from the resolved gem, scoping the color to each item independently
- Stat values rendered with `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` — gem-tinted but legible
- Added a soft gem-tinted `text-shadow` glow to each stat value
- Added a gem-tinted hairline underline (gradient fading right to transparent) via `background-image`/`background-position` so the four stats read as a color chord across the row

**`packages/three-flatland/README.md`**

- Renamed heading "Why three-flatland?" → "Why Flatland?" to match brand naming convention

StatsBanner now renders each stat in its declared gem color, with value glow and underline, instead of a uniform foreground tone.
