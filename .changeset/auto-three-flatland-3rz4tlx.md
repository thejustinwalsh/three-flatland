---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: StatsBanner gem color support

**`StatsBanner` — `color` prop re-enabled with gem accent rendering**

- `color` prop on `StatItem` is no longer deprecated or ignored; passing a gem name (e.g. `color="diamond"`) now actively tints the stat
- Legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their gem equivalents via the same `legacyToGem` table used by `FeatureCard` and `ValueProp` — no MDX call-site changes required
- Each stat's value text is colored at 65% gem + 35% foreground for legibility, with a soft gem-tinted `text-shadow` glow
- A 1.5px gem-tinted hairline underline (linear gradient fading right to transparent) is drawn beneath each stat item, making the four stats read as a colored chord across the row
- `--stat-accent` CSS custom property is set inline per stat from the resolved gem token
- `data-gem` attribute added to each `.stat-item` for CSS or JS targeting
- README: heading updated from "Why three-flatland?" to "Why Flatland?"

Re-enables intentional per-stat gem coloring in `StatsBanner`, replacing the previous flat `--foreground` fallback.
