---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem accent on stat values and underlines

- Re-enabled the previously no-op `color` prop on each `StatItem` — gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) now take effect
- Legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their gem equivalents via `legacyToGem`, preserving backward-compat with existing MDX call sites
- Each stat sets `--stat-accent` from its resolved gem; the value text is color-mixed 65% gem / 35% foreground with a soft gem-tinted glow
- A thin gem-tinted hairline underline (gradient fading right to transparent) is rendered beneath each stat via `background-image`, making the four stats read as a colored chord across the row
- `data-gem` attribute is set on each stat item for potential CSS / JS targeting
- README: section heading updated from "Why three-flatland?" to "Why Flatland?" for consistency with the visual brand

The `StatsBanner` component now visually expresses per-stat gem identity through tinted value text and underline accents, bringing it in line with `FeatureCard` and `ValueProp`.
