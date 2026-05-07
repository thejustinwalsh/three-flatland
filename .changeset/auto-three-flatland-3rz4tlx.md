---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs: StatsBanner gem accent colors

- Re-enabled the `color` prop on `StatsBanner` stat items — it was previously marked `@deprecated` and silently ignored, causing all stats to render in `--foreground`
- `color` now accepts gem names (`diamond`, `pink`, `gold`, `amethyst`, etc.) or legacy color aliases (`cyan`, `blue`, `green`, …) resolved via the shared `legacyToGem` table
- Each stat sets `--stat-accent` inline from the resolved gem token; value text is color-mixed 65% gem + 35% foreground for legibility, with a soft gem-tinted `text-shadow` glow
- Gem-tinted hairline underline added per stat via `background-image` gradient (fades to transparent at 100%), creating a colored chord across the stats row
- `data-gem` attribute set on each stat item for CSS/JS targeting
- Minor README heading update: "Why three-flatland?" → "Why Flatland?"

Restores per-stat gem accent coloring to `StatsBanner`, making the four stats visually distinct with colored values and underlines matching the site's gem palette.
