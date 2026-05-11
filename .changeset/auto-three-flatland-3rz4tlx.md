---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem-accented values and per-stat underlines

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatItem` — was previously accepted but silently ignored, causing all stats to render in `--foreground` regardless of the gem name passed in MDX
- `color` now resolves to a gem token (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`); legacy conventional names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped via a `legacyToGem` table consistent with `FeatureCard` and `ValueProp`
- Sets `--stat-accent` inline per stat from the resolved gem, scoping the accent to each individual item
- Stat value text color is now `color-mix(in oklab, --stat-accent 65%, --foreground)` — gem-tinted but readable — with a soft gem-tinted `text-shadow` glow
- Each stat now has a gem-tinted hairline underline (1.5px linear gradient fading right to transparent via `background-image`), so the four stats read as a colored chord across the row rather than a flat band

**`packages/three-flatland/README.md`**

- Fixed heading copy: "Why three-flatland?" → "Why Flatland?"

No breaking changes. Existing MDX call sites that pass legacy color names (`cyan`, `blue`, etc.) or omit `color` entirely continue to work without modification.

The `StatsBanner` component now participates fully in the gem color taxonomy: each stat renders its own accent hue on both its value and its underline, matching the color-as-taxonomy principle used by other doc-site components.
