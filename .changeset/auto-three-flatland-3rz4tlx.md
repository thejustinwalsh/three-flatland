---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem color support restored

- Re-enabled the `color` prop on `StatsBanner` stats; was previously marked deprecated and silently ignored, causing all stats to render in `--foreground`
- `color` now resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`, accepting both gem names (`diamond`, `pink`, `gold`, `amethyst`, …) and conventional aliases (`cyan`, `blue`, `green`, etc.)
- Each stat sets `--stat-accent` inline from the resolved gem, scoping the accent to the individual stat item
- Stat value text color is now `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` with a soft gem-tinted `text-shadow` glow for legibility
- Added a gem-tinted hairline underline per stat via `background-image` gradient, fading to transparent at the right edge — the four colored lines read as a chord across the row
- Minor README heading update: "Why three-flatland?" → "Why Flatland?"

The `StatsBanner` now participates fully in the gem color taxonomy; MDX authors passing `color="diamond"` (etc.) will see the intended accent rather than a flat foreground rendering.
