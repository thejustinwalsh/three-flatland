---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Changes

**`StatsBanner` component (`docs/src/components/StatsBanner.astro`)**

- Re-enabled the `color` prop on each stat — it was silently ignored, causing all four stats to render in `--foreground`
- `color` now resolves to a gem token via the shared `legacyToGem` table (supports conventional names like `cyan`, `blue`, `green` as well as gem names)
- Each stat item sets `--stat-accent` inline from its resolved gem, scoping all color derivations locally
- Stat value text uses `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` — gem-tinted but legible
- Added `text-shadow` glow on stat values (35% gem opacity, 18px radius)
- Added gem-tinted hairline underline per stat — `background-image` linear-gradient fading right, 1.5px, at the bottom edge — so the four stats read as a colored chord across the row

**`README.md` (`packages/three-flatland`)**

- Renamed section heading from "Why three-flatland?" to "Why Flatland?" to match brand naming convention

Restores per-stat gem color across `StatsBanner` so MDX-authored color props (diamond, pink, gold, amethyst, etc.) take visual effect; also aligns README heading with the established brand/visual identity split.
