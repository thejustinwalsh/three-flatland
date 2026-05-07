---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Changes

**StatsBanner**

- Re-enabled the previously deprecated `color` prop on `StatItem`; stat values now render in their assigned gem accent instead of a flat `--foreground`
- Added `legacyToGem` mapping so conventional color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) resolve to the gem palette without breaking existing MDX call sites
- Stat value text is now `color-mix(gem 65%, foreground 35%)` for legibility, plus a soft gem-tinted `text-shadow` glow
- Each stat item gets a thin hairline underline via a `background-image` gradient that fades from the gem accent to transparent — the four stats read as a colored chord across the row
- `--stat-accent` CSS custom property and `data-gem` attribute set inline per stat item for downstream styling hooks

**README**

- Renamed section heading from "Why three-flatland?" to "Why Flatland?" for consistency with the visual brand

Restores gem-color differentiation to the docs landing page stats strip and aligns the README section heading with the established brand name.
