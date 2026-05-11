---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem accent on stat values and underlines

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatItem` — previously marked `@deprecated` and silently ignored, so all stats rendered in `--foreground` regardless of the gem name passed from MDX
- Added `Gem` and `LegacyColor` type aliases; `resolveGem()` maps conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) to their gem equivalents, matching the same lookup table used by `FeatureCard` and `ValueProp`
- Each stat now sets `--stat-accent` inline from the resolved gem CSS variable
- Stat value text uses `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` for legibility, plus a soft `text-shadow` glow at 35% gem opacity
- Each `.stat-item` gets a gem-tinted hairline underline via `background-image` gradient (fades to transparent at 100%), making the four stats read as a colored chord across the row

**`packages/three-flatland/README.md`**

- Renamed section heading from "Why three-flatland?" to "Why Flatland?" to align with the brand naming convention (short human-facing brand vs. npm package name)

Stats homepage `StatsBanner` now respects per-stat gem color from MDX, rendering value text and hairline underlines in the assigned gem accent rather than a flat foreground color.
