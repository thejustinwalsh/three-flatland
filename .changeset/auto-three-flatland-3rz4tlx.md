---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: SiteFooter, API routing, landing copy, StatsBanner gem accents

### Docs theme

- Added `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted headings with per-section hover colors, foil rule accent — renders on every page
- Added `lib/packages.ts`: shared build-time workspace-package discovery; drives both the footer Packages column and the landing alpha ribbon from a single source
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` field; corner ribbon reads it to signal project-level alpha state
- Header wordmark: removed +2px vertical offset; baseline now aligns with header text
- API reference sidebar: nested groups are always-open (`forceCollapsable` cascade) — full API tree is visible on any API page
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- Added `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from TypeDoc-generated URLs so links resolve to directory roots
- `astro.config.mjs`: set `entryFileName=index`, wired `stripIndexLinks`, set `starlight.description` (feeds footer tagline + meta description), cleared `footerText`

### Landing copy

- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" (prior wording implied an upstream fork relationship)
- VP1 opener rewritten to drop a false-universal categorical claim
- Hero subtagline: em-dash removed; replaced with two short declaratives
- Stats banner: sprite count updated from 10K+ to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the previously deprecated `color` prop on `StatsBanner` stat items
- `color` resolves to a gem name; conventional color aliases (`cyan`, `blue`, `green`, etc.) map to gems via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text is now tinted by the resolved gem (65% gem / 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat renders a thin gem-tinted hairline underline (gradient fading right) so the four stats read as a colored chord across the row
- README: section heading updated from "Why three-flatland?" to "Why Flatland?"

Adds a site-wide footer, fixes API reference link routing, refreshes landing copy for accuracy, and restores gem color accents to the stats strip.
