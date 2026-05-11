---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem-accented stat values and underlines (`docs`)

- Re-enabled the previously deprecated `color` prop on `StatsBanner` stat items; it now resolves to a gem accent and is applied visually
- Legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) map to their nearest gem via a `legacyToGem` lookup, matching the same table used by `FeatureCard` and `ValueProp` — no MDX call-site changes required
- Each stat sets `--stat-accent` inline from the resolved gem; the value text renders at 65% gem + 35% foreground for legibility with a soft gem-tinted `text-shadow` glow
- Added a gem-tinted hairline underline (gradient fading right to transparent) per stat, so a row of four stats reads as a colored chord rather than a flat band
- Minor README heading tweak: "Why three-flatland?" → "Why Flatland?"

`StatsBanner` on the docs landing page now renders each stat in its assigned gem color with a matching accent underline, turning the stats strip from a monochrome band into a visually distinct chord of four gem-tinted highlights.
