---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: StatsBanner gem accent, README heading fix

**`StatsBanner` — `color` prop re-enabled with gem accent support**

- Un-deprecated the `color` prop on `StatItem`; it was previously marked `@deprecated` and ignored, causing all stats to render in `--foreground` regardless of the gem name passed in MDX
- `color` now resolves to a gem token via the shared `legacyToGem` table (same mapping used by `FeatureCard` and `ValueProp`), accepting both gem names (`diamond`, `pink`, `gold`, `amethyst`, …) and conventional aliases (`cyan`, `blue`, `green`, …)
- Per-stat `--stat-accent` CSS custom property is set inline from the resolved gem, scoped to each `stat-item`
- Stat value text color is now `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` — gem-tinted but legible — with a soft gem-tinted `text-shadow` glow
- Each stat item gets a gem-tinted hairline underline via `background-image: linear-gradient(90deg, …)` fading to transparent at the right edge, so the four stats read as a colored chord across the row
- `data-gem` attribute added to each `stat-item` for CSS/JS hooks
- Removed stale inline comments about the deprecated behavior

**README**

- Renamed "Why three-flatland?" section heading to "Why Flatland?" to match the established brand naming convention

Restores intentional per-stat color theming in `StatsBanner` and aligns the README heading with the brand (visual name "flatland", package name "three-flatland").
