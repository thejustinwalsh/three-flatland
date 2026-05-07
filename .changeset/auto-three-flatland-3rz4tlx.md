---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem-accented values and underlines

- Re-enabled the previously ignored `color` prop on `StatsBanner` stat items — values now render in their declared gem accent rather than the flat foreground color
- `color` accepts gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) and maps legacy conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) to the nearest gem via a `legacyToGem` lookup table
- Each stat's `--stat-accent` CSS custom property is set inline from the resolved gem token, scoping the accent to that stat only
- Stat value text color is now `color-mix(in oklab, var(--stat-accent) 65%, var(--foreground))` — gem-tinted but legible — with a soft gem-tinted `text-shadow` glow
- A 1.5px gem-tinted hairline underline (gradient from full accent → 70% → transparent) spans each stat, so the four stats read as a colored chord across the row
- Removed stale "deprecated" JSDoc annotation from the `color` prop interface
- Minor README heading update: "Why three-flatland?" → "Why Flatland?"

The four landing-page stats now each carry their own gem accent, turning a flat monochrome row into a visually distinct chord of colored values.
