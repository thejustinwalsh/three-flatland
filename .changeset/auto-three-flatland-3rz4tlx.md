---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner: gem color accents restored

- `color` prop on `StatsBanner` stat items is no longer ignored; passing a gem name (`diamond`, `gold`, `ruby`, `emerald`, `amethyst`, `pink`, `salmon`, `turquoize`) or a legacy color alias (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) now applies a visible accent
- Legacy color names are mapped to their gem equivalents (e.g. `cyan` → `diamond`, `red` → `ruby`) via the same `legacyToGem` table used by `FeatureCard` and `ValueProp` — no MDX call-site changes required
- Each stat's value text is rendered with `color-mix(in oklab, gem 65%, foreground)` plus a soft gem-tinted `text-shadow` glow, keeping legibility while conveying color identity
- A gem-tinted hairline underline (gradient fading right to transparent) is painted beneath each stat via `background-image`, so a row of four stats reads as a colored chord rather than a flat monochrome band
- README heading updated from "Why three-flatland?" to "Why Flatland?" for consistency with the visual brand

Restores the intended gem-colored accent system to the landing page stats strip; existing MDX call sites require no changes.
