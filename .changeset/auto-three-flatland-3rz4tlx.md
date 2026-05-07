---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem color prop re-enabled

**`docs/src/components/StatsBanner.astro`**

- `color` prop on `StatItem` was previously accepted but silently ignored; all four stats rendered in `--foreground`. Now fully active.
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) resolve directly; legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) map to gems via the same `legacyToGem` table used by `FeatureCard` and `ValueProp` — no MDX call-site changes required.
- Per-stat `--stat-accent` CSS custom property set inline from the resolved gem.
- Stat value text color mixed 65% gem + 35% foreground for legibility, plus a soft gem-tinted `text-shadow` glow.
- Thin gem-tinted gradient hairline underline (fades right to transparent) added beneath each stat via `background-image`; the four stats now read as a colored chord across the row.

**`packages/three-flatland/README.md`**

- Section heading renamed from "Why three-flatland?" to "Why Flatland?" for consistency with the brand wordmark.

Re-enabling the `color` prop restores intentional per-stat gem accents on the landing-page stats strip and aligns `StatsBanner` with the gem-color taxonomy used across all other doc-site components.
