---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Changes

**StatsBanner — gem color prop restored (`docs/src/components/StatsBanner.astro`)**

- Re-enabled the `color` prop on each `StatItem`; was previously accepted but silently ignored, causing all stats to render in `--foreground`
- `color` accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) or conventional color aliases (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) mapped to their nearest gem via `legacyToGem`
- Each stat now sets `--stat-accent` inline from the resolved gem token
- Stat value text rendered with `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` for legibility, plus a soft gem-tinted `text-shadow` glow
- Gem-tinted hairline underline added per stat (linear gradient fading right to transparent), making the four stats read as a colored chord across the row rather than a flat band

**README (`packages/three-flatland/README.md`)**

- Section heading renamed from "Why three-flatland?" to "Why Flatland?" to align with the brand naming convention (short human-facing name in prose)

StatsBanner's `color` prop is fully functional again; any MDX call sites that previously passed gem names will now see the correct per-stat accent colors without any changes to their markup.
