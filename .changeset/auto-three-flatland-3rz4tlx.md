---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, gem stat accents

### Site footer

- New `SiteFooter.astro`: brand lockup with Docs, Packages, and Community link columns, version row, gem-tinted section headings, and foil-rule top accent -- renders on every page
- New `lib/packages.ts`: reads `packages/*/package.json` at build time; drives footer Packages column and landing alpha-ribbon from one source; suppresses badges that match the project-wide baseline
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` added to signal project-level alpha state to the corner ribbon
- `Header.astro`: removed +2 px wordmark offset so the pixel mark baseline-aligns with surrounding header text
- `SidebarSublist.astro`: API ref nested groups are always-open via `forceCollapsable` cascade -- full API tree visible without expanding manually
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from TypeDoc-generated URLs, so module index pages link to their directory root
- `astro.config.mjs`: `entryFileName=index`, `stripIndexLinks` wired into `remarkPlugins`, `starlight.description` set (feeds footer tagline and `<meta>` description), `footerText` cleared

### Landing page copy

- Section heading: "Built into three.js, not on top of it" -> "Built for three.js" (avoids implying an upstream fork)
- VP1 opener rewritten to drop a false-universal categorical claim
- Hero subtagline: em-dash removed in favour of two short declaratives
- StatsBanner sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the `color` prop on each stat (was marked deprecated and ignored, causing all values to render in `--foreground`)
- Color resolves through the same `legacyToGem` table used by `FeatureCard` / `ValueProp`; conventional names (cyan, blue, green, etc.) map to gem tokens
- Stat value text renders in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat gains a thin gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

Adds a full site footer, fixes API reference link routing, tightens landing copy, and restores gem color accents on the stats banner.
