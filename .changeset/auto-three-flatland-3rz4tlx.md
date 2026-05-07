---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: re-enabled gem color accents (`docs`)

- `color` prop on `StatsBanner` stat items is now active; was previously accepted but silently ignored, causing all stats to render in `--foreground`
- Conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their gem equivalents via a `legacyToGem` table — existing MDX call sites require no changes
- Each stat resolves its gem and sets `--stat-accent` inline; the stat value color is a 65/35 blend of gem + foreground for legibility
- Stat value gains a soft `text-shadow` glow tinted by the gem accent
- A 1.5px hairline underline rendered via `background-image` (linear-gradient fading right to transparent) runs beneath each stat, so the four stats read as a colored chord across the row
- README: section heading updated from "Why three-flatland?" to "Why Flatland?" to match brand naming

Stats previously appearing in a flat monochrome row now render each value and underline in its designated gem color (diamond, pink, gold, amethyst, etc.) without requiring any changes to existing MDX content.
