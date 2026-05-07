---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs — StatsBanner gem accents

**`StatsBanner`** (`docs/src/components/StatsBanner.astro`)

- Re-enabled the `color` prop on each stat item — was previously deprecated and silently ignored, causing all four stats to render in `--foreground`
- `color` now accepts any gem name (`diamond`, `gold`, `ruby`, `amethyst`, …) or a legacy conventional color (`cyan`, `blue`, `green`, etc.) mapped through the shared `legacyToGem` table
- Each stat item sets a scoped `--stat-accent` CSS custom property at render time from the resolved gem token
- Stat value text uses a `color-mix` of 65% gem + 35% foreground, keeping values legible while visually distinct; a soft `text-shadow` glow reinforces the gem tint
- Each stat carries a gem-tinted hairline underline (1.5 px linear gradient fading right to transparent) so the row of stats reads as a colored chord rather than a flat band

**`README.md`** (`packages/three-flatland/README.md`)

- Renamed section heading "Why three-flatland?" → "Why Flatland?" to align with brand naming conventions

StatsBanner now correctly applies the gem color passed in MDX, restoring the intended visual taxonomy across the docs landing page stats row.
