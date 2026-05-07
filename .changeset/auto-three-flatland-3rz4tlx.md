---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

**StatsBanner: gem-accented stat values and underlines**

- `color` prop on `StatsBanner` stat items is now active — was previously accepted but silently ignored, causing all stats to render in `--foreground`
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) resolve directly; legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) map to the nearest gem via the shared `legacyToGem` table
- Each stat item sets `--stat-accent` from its resolved gem; stat value text renders as 65% gem + 35% foreground with a soft gem-tinted `text-shadow` glow
- A thin hairline underline (1.5px, gem-tinted linear gradient fading to transparent) is drawn beneath each stat via `background-image`, giving the four stats a colored chord appearance
- `data-gem` attribute set on each stat item for future CSS/JS targeting

**README**

- Section heading updated from "Why three-flatland?" to "Why Flatland?"

`StatsBanner` now renders per-stat gem accents end-to-end; existing MDX call sites with legacy color names continue to work without changes.
