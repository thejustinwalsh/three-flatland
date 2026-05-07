---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: StatsBanner gem color support

- Re-enabled the `color` prop on `StatsBanner` stats — previously marked deprecated and silently ignored, causing all stats to render in `--foreground`
- `color` now resolves to a gem token (e.g. `diamond`, `pink`, `gold`, `amethyst`) via the same `legacyToGem` mapping used by `FeatureCard` and `ValueProp`
- Each stat item gets a scoped `--stat-accent` CSS custom property driven by the resolved gem
- Stat value text uses `color-mix(in oklab, --stat-accent 65%, --foreground)` so values read their gem hue while staying legible
- Soft gem-tinted `text-shadow` glow added to stat values
- Thin gem-tinted hairline underline (gradient fading right to transparent) applied to each stat via `background-image` trick, giving the stats row a colored chord visual
- Removed stale deprecation comment from background tinted-band rule
- Minor README heading update: "Why three-flatland?" → "Why Flatland?"

StatsBanner stat items now render their declared gem color end-to-end — value text, glow, and underline accent all derive from a single `color` prop, consistent with the rest of the gem-taxonomy component system.
