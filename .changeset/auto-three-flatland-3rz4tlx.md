---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner gem color support

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatItem` — was marked `@deprecated` and silently ignored, causing all stats to render in `--foreground`
- `color` now accepts any `Gem` name or legacy color alias (e.g. `cyan`, `blue`, `green`); aliases are resolved through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Sets `--stat-accent` as an inline CSS variable per stat, scoped to the resolved gem token
- Stat value text uses `color-mix(in oklab, --stat-accent 65%, --foreground)` so each value reads its own gem color while staying legible
- Adds a soft `text-shadow` glow on stat values using the gem accent at 35% opacity
- Adds a gem-tinted hairline underline per stat via a `linear-gradient` background (fades to transparent at the right edge), so a row of stats reads as a colored chord rather than a flat band

**`packages/three-flatland/README.md`**

- Renamed section heading "Why three-flatland?" → "Why Flatland?" to match the brand visual/wordmark

Restores per-stat gem accent coloring in `StatsBanner` — values, glows, and underlines now reflect each stat's `color` prop as intended.
