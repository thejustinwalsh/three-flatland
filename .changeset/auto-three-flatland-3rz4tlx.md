---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner gem color accent (`docs/src/components/StatsBanner.astro`)

- Re-enabled the `color` prop on `StatsBanner` stat items — previously accepted but silently ignored, causing all stats to render in `--foreground`
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) now resolve to the corresponding CSS custom property via `--stat-accent`
- Legacy conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to the nearest gem via the same `legacyToGem` table used by `FeatureCard` / `ValueProp` — existing MDX call sites continue to work without changes
- Stat value text color is now `color-mix(in oklab, --stat-accent 65%, --foreground)` with a soft gem-tinted `text-shadow` glow for legibility
- Each stat item gains a 1.5px gem-tinted hairline underline rendered via `background-image: linear-gradient(90deg, ...)` fading to transparent — the four stats read as a colored chord across the row

### README heading update (`packages/three-flatland/README.md`)

- Renamed "Why three-flatland?" section heading to "Why Flatland?" to align with the established brand naming convention (short "flatland" mark for humans, "three-flatland" for npm/SEO)

`StatsBanner` now correctly applies per-stat gem color accents that were previously wired up in MDX but had no visual effect. Legacy color names are automatically mapped to gems, so no MDX changes are required.
