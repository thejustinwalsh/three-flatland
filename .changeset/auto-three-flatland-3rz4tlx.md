---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem accent on value text and underline

- Re-enabled the `color` prop on `StatItem` — was accepted but silently ignored; all stats now render with their declared gem accent
- Conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to gem equivalents via the shared `legacyToGem` table; existing MDX call sites require no changes
- Stat value text is colored `65% gem + 35% foreground` for legibility, with a soft gem-tinted `text-shadow` glow
- Each stat receives a `--stat-accent` CSS custom property set inline; the CSS fallback is `--primary` when no gem is specified
- Thin gem-tinted hairline underline added per stat via `background-image` gradient (fades to transparent at the right edge), so multiple stats read as a colored chord across the row rather than a flat band
- Minor README heading update: "Why three-flatland?" → "Why Flatland?"

`StatsBanner` now correctly applies gem accent colors to value text and underlines for each stat, matching the behavior of `FeatureCard` and `ValueProp`.
