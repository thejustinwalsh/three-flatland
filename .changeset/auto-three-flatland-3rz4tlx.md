---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

**StatsBanner: gem-accented stats**

- Re-enabled the `color` prop on `StatItem` (was deprecated and silently ignored; all stats previously rendered in `--foreground`)
- `color` now resolves to a gem token; legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their gem equivalents via the same `legacyToGem` table used by `FeatureCard` and `ValueProp` — no MDX call-site changes required
- Per-stat `--stat-accent` CSS variable is set inline from the resolved gem, scoping the accent to each stat independently
- Stat value text is rendered with a gem-foreground mix (`65% gem / 35% foreground`) for legibility, plus a soft gem-tinted `text-shadow` glow
- Each stat gains a thin gem-tinted hairline underline (linear gradient fading to transparent) so the four stats read as a colored chord across the row rather than a flat monochrome band

**Docs**

- README heading changed from "Why three-flatland?" to "Why Flatland?" for consistency with the visual brand

Restores the intended per-stat gem coloring in `StatsBanner` — passing `color="diamond"` (or any gem/legacy name) now visibly tints the value and draws a matching underline accent.
