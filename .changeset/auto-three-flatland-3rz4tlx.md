---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem-accented stats

- Re-enabled the `color` prop on `StatsBanner` stat items — previously accepted but silently ignored, causing all stats to render in `--foreground`
- `color` now resolves to a gem accent (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`); conventional names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) map to their nearest gem via the shared `legacyToGem` table
- Stat value text is tinted with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted `text-shadow` glow
- Each stat now renders a thin gem-tinted hairline underline (linear gradient fading right) so the stat row reads as a colored chord rather than a flat band
- Existing MDX call sites with named colors continue to compile without changes

Restores intentional gem-color taxonomy to the landing page stats strip; no breaking changes — legacy color names are silently remapped.
