---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner — gem color accent restored

- Re-enabled the `color` prop on `StatItem` (was silently ignored; all stats rendered in `--foreground`)
- `color` accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) and legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple` — mapped via `legacyToGem`)
- Resolved gem sets `--stat-accent` inline; stat value text uses a 65/35 gem-foreground mix plus a soft gem-tinted `text-shadow` glow for legibility
- Thin gem-tinted hairline underline (linear gradient, fades right) drawn beneath each stat via `background-image` trick — four stats now read as a colored chord across the row
- `data-gem` attribute set on each `.stat-item` for future CSS/JS targeting

### Docs — minor copy fix

- README heading changed from "Why three-flatland?" to "Why Flatland?" for brand consistency

Restores per-stat gem coloring in `StatsBanner` so MDX call sites that pass `color="diamond"` (etc.) are visually honored rather than silently ignored.
