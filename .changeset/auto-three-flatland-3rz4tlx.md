---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem color prop restored, per-stat accent styling

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatsBanner` stat items — previously marked deprecated and silently ignored, causing all stats to render in `--foreground`
- Added `resolveGem()` helper that normalises conventional color names (`cyan`, `blue`, `green`, etc.) to gem tokens via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Each stat now sets `--stat-accent` inline from its resolved gem, scoped to the `.stat-item` element
- Stat value text color changed from `var(--foreground)` to `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` — gem-tinted but legible
- Added soft `text-shadow` glow on stat values using the gem accent at 35% opacity
- Each stat carries a gem-tinted hairline underline via `background-image: linear-gradient(90deg, …)` fading to transparent — four stats read as a colored chord across the row

**`packages/three-flatland/README.md`**

- Renamed section heading "Why three-flatland?" → "Why Flatland?" to match the short brand name

StatsBanner stats now render with per-gem accent colors matching the values passed in MDX, restoring visual taxonomy across the highlight row.
