---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, gem-colored stats

### Footer

- Added `SiteFooter.astro` — brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted column headings with per-section hover colors, foil rule top accent; renders on every page
- Added `lib/packages.ts` — shared build-time workspace-package discovery; drives the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project-wide baseline (all-alpha = noise)
- `packages/three-flatland/package.json`: added `flatland.badge = "Alpha"` to signal project-level alpha state to the corner ribbon

### API reference routing

- Added `typedoc-plugins/strip-index-links.mjs` — remark plugin that strips trailing `/index/` segments from typedoc-generated link URLs, fixing broken links produced by `entryFileName: 'index'`
- `astro.config.mjs`: wired `stripIndexLinks` plugin, set `entryFileName: 'index'`, added `starlight.description` (feeds footer tagline + meta description), cleared `footerText`

### Theme / layout

- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups forced always-open via `forceCollapsable` cascade; full API tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

### Landing copy

- Section heading: "Built into three.js, not on top of it" -> "Built for three.js" (prior wording implied an upstream fork)
- ValueProp opener reworded to drop false-universal categorical claim
- Hero subtagline: removed em-dash; split into two short declaratives
- StatsBanner sprite count updated: 10K+ -> 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the `color` prop on `StatsBanner` stats (was marked deprecated and silently ignored)
- `color` resolves to a gem name via `legacyToGem` (same mapping used by `FeatureCard` / `ValueProp`)
- Stat value text rendered with a gem-mixed color (65% gem + 35% foreground) plus a soft gem-tinted `text-shadow` glow
- Each stat gets a gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

Two commits adding a full-featured site footer, fixing API reference URL routing, and making landing stats visually distinct with per-gem color accents.
