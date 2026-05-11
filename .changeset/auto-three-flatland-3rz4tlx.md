---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem-accented values and underlines

- Re-enabled the `color` prop on `StatItem` (was accepted but silently ignored)
- Each stat's value text now renders in its gem color (65% gem / 35% foreground mix) with a soft glow shadow
- A gem-tinted hairline underline (linear gradient fading right) appears beneath each stat, making the row read as a colored chord
- Legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their gem equivalents via `legacyToGem`, matching the same table used by `FeatureCard` and `ValueProp`
- `--stat-accent` CSS custom property is set inline per stat from the resolved gem token
- README heading updated from "Why three-flatland?" to "Why Flatland?" to align with brand naming

The `StatsBanner` component now gives each stat its own gem identity rather than rendering all values in a uniform foreground color.
