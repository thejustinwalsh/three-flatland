---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem-accented values and underlines

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatItem` — was previously accepted but silently ignored, causing all stats to render in `--foreground`
- `color` now accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) or legacy color aliases (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) mapped via a `legacyToGem` lookup table consistent with `FeatureCard` / `ValueProp`
- Resolved gem sets `--stat-accent` inline; stat value text is mixed 65% gem + 35% foreground for legibility, with a soft gem-tinted `text-shadow` glow
- Each stat gets a thin gem-tinted gradient underline (fades right to transparent) so the row reads as a colored chord rather than a flat band
- `data-gem` attribute added to `.stat-item` for CSS/JS targeting

**`packages/three-flatland/README.md`**

- Renamed "Why three-flatland?" section heading to "Why Flatland?" for consistency with the brand wordmark

StatsBanner now renders each stat in its own gem accent color, turning the previously flat stats row into a visually distinct, color-coded performance chord.
