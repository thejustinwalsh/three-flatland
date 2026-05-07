---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem-accented stats (`docs/src/components/StatsBanner.astro`)

- Re-enabled the `color` prop on each `StatItem` — was previously marked `@deprecated` and silently ignored, causing all four stats to render in `--foreground` regardless of the gem name passed from MDX
- `color` now accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) or legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) — legacy names are mapped to the nearest gem via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Resolved gem sets a `--stat-accent` CSS custom property inline on each stat container; fallback is `--primary`
- Stat value text colored as `color-mix(in oklab, --stat-accent 65%, --foreground)` with a soft `text-shadow` glow so values are legible while carrying the gem hue
- Gem-tinted hairline underline drawn via `background-image` gradient (fades to transparent at 70–100%) beneath each stat, creating a colored chord across the row

### README: section heading rename (`packages/three-flatland/README.md`)

- Renamed "Why three-flatland?" to "Why Flatland?" to align with the visual brand name

---

Re-enables `color` prop on `StatsBanner` stats so gem accents (and legacy color aliases) are applied to value text and underline decoration. README heading updated to use the short "Flatland" brand name.
