---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: StatsBanner gem accent + README heading

**`StatsBanner` (`docs/src/components/StatsBanner.astro`)**

- Re-enabled the `color` prop on `StatItem` — was previously marked `@deprecated` and silently ignored, causing all four stats to render in `--foreground` regardless of the gem name passed from MDX
- `color` now accepts any gem name (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) or a legacy conventional color (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) — legacy names are mapped to their nearest gem via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Resolved gem sets `--stat-accent` as an inline CSS custom property on each `.stat-item`, scoping the accent to that stat only
- Stat value text color is now a 65/35 mix of gem accent and foreground (`color-mix(in oklab, ...)`), keeping the number legible while carrying the gem hue; a soft gem-tinted `text-shadow` glow reinforces the accent
- Each stat gains a thin (1.5 px) gem-tinted hairline underline rendered via `background-image: linear-gradient` fading to transparent at the right edge — the four stats together read as a colored chord across the row rather than a flat monochrome band
- `data-gem` attribute written to each `.stat-item` for future CSS or JS targeting

**`packages/three-flatland/README.md`**

- Renamed section heading from "Why three-flatland?" to "Why Flatland?" to match the brand naming convention (visual identity uses the short "flatland" mark)

StatsBanner color props now fully functional — gem accents on the landing-page stats strip are live, with legacy color names automatically mapped to the gem palette.
