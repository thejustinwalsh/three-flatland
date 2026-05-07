---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem color accent on values and underlines

- Re-enabled the `color` prop on `StatsBanner` stat items — previously accepted but silently ignored, causing all stats to render in `--foreground`
- `color` now resolves to a gem token (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`); conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) map via a `legacyToGem` table for backward compatibility
- Stat value text is tinted 65% gem + 35% foreground for legibility, with a soft gem-tinted `text-shadow` glow
- Each stat gains a thin gem-tinted hairline underline (linear gradient fading right) so a row of four stats reads as a colored chord rather than a flat band

Existing MDX call sites passing conventional color names continue to compile without changes. The `StatsBanner` component now fully participates in the gem palette system alongside `FeatureCard` and `ValueProp`.
