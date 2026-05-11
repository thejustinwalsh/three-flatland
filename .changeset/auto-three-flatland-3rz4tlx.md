---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem color accent on values and underlines

**`docs/src/components/StatsBanner.astro`**

- Re-enabled the `color` prop on `StatItem` — was silently ignored; stats now render with gem-tinted accents
- `color` accepts both gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) and legacy color aliases (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) mapped via a `legacyToGem` table
- Each stat resolves its gem and sets `--stat-accent` inline; stat value text renders at 65% gem + 35% foreground for legibility, plus a soft gem-tinted `text-shadow` glow
- Gem-tinted hairline underline added per stat via `background-image` gradient (fades right to transparent), making the four stats read as a colored chord across the row
- `data-gem` attribute applied to each `.stat-item` for downstream CSS or JS targeting

**`packages/three-flatland/README.md`**

- Renamed "Why three-flatland?" section heading to "Why Flatland?" to align with brand wordmark

`StatsBanner` color props are now active — passing `color="diamond"` (or legacy aliases like `color="blue"`) to a stat produces a visible gem accent on the value text and underline.
