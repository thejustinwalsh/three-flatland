---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Footer**
- New `SiteFooter.astro`: brand lockup with Docs, Packages, and Community link columns; gem-tinted section headings with per-section hover colors; foil rule top accent; renders on all pages
- New `lib/packages.ts`: reads `packages/*/package.json` at build time; drives footer Packages column and landing alpha-ribbon from a single source; suppresses badges that match the project-wide baseline

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from TypeDoc-generated URLs so per-module pages are reachable at their directory root
- `astro.config.mjs`: set `entryFileName=index`, wire `stripIndexLinks` plugin, populate `starlight.description` for meta and footer tagline, clear legacy `footerText`
- `SidebarSublist.astro`: API ref nested groups always expanded via `forceCollapsable` cascade

**Landing page**
- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" (prior wording implied an upstream fork relationship)
- VP1 opener rewritten to drop false-universal categorical claim
- Hero subtagline: removed em-dash, split into two short declaratives
- StatsBanner sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner color prop

- Re-enabled previously deprecated `color` prop; all four stats now render in their declared gem color instead of `--foreground`
- Stat value text rendered as 65% gem + 35% foreground mix with a soft gem-tinted glow
- Thin gem-tinted hairline underline added per stat (gradient fading right), giving the row a colored chord appearance
- `color` resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`

### Theme cleanup

- `Header.astro`: removed +2px wordmark offset; baseline now aligns with header text
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

Adds a site footer, fixes API reference link routing, updates landing copy for accuracy, and restores gem-color accents on the stats banner.
