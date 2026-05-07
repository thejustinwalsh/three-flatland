---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem-accented values and hairline underlines

- `color` prop on `StatItem` is fully re-enabled (was silently ignored); accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) and legacy color aliases (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple` — mapped to gems via the same `legacyToGem` table used by `FeatureCard`/`ValueProp`)
- Each stat now sets `--stat-accent` from its resolved gem, so accent color is scoped per stat
- Stat value text color is `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` with a soft gem-tinted `text-shadow` glow — legible but visually distinct per gem
- Each stat item gets a gem-tinted hairline underline rendered as a `background-image` linear gradient (100% → 70% → transparent), creating a colored chord across the four-stat row
- README: section heading updated from "Why three-flatland?" to "Why Flatland?"

Restores per-stat gem colorization to `StatsBanner` so landing-page statistics render with the intended palette accent rather than a flat foreground color.
