---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### `StatsBanner`: re-enabled `color` prop with gem accent styling

- `color` prop on `StatItem` was previously marked deprecated and silently ignored; now fully functional
- Accepts any `Gem` name (`diamond`, `gold`, `amethyst`, `emerald`, etc.) or a legacy conventional color (`cyan`, `blue`, `green`, …) mapped through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Resolved gem sets a per-stat `--stat-accent` CSS custom property inline, scoping all color work to each stat independently
- Stat value text color blends 65% gem + 35% foreground for legibility; adds a soft gem-tinted `text-shadow` glow
- Each stat renders a gem-tinted hairline underline (1.5px linear-gradient fading to transparent at the right edge), making the four stats read as a colored chord across the row
- `data-gem` attribute emitted on `.stat-item` for downstream CSS/JS targeting

### README

- Renamed section header "Why three-flatland?" → "Why Flatland?" to match brand naming conventions

---

`StatsBanner` now renders per-stat gem accent colors end-to-end — value text, glow, and hairline underline — using the same `legacyToGem` resolution as other themed components. Previously, all stats rendered in the default foreground color regardless of the `color` prop passed in MDX.
