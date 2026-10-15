---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Footer**
- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings, foil rule accent; replaces the previous AI-disclaimer footer text
- New `lib/packages.ts`: shared build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges matching the project-level baseline to reduce noise

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from TypeDoc-generated URLs, fixing links to per-module index pages emitted as directory roots by Astro
- `astro.config.mjs`: set `entryFileName=index`, wire `stripIndexLinks` plugin, populate `starlight.description` (feeds footer tagline + `<meta description>`)

**Landing page copy**
- Section heading: "Built into three.js, not on top of it" -> "Built for three.js" (removes false implication of an upstream fork)
- VP1 opener rewritten to avoid a false-universal categorical claim
- Hero subtagline: em-dash removed; replaced with two short declaratives
- StatsBanner sprite count updated: 10K+ -> 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

**Theme polish**
- `Header.astro`: wordmark +2px offset removed; baseline now aligns with header text
- `SidebarSublist.astro`: API ref nested groups always-open via `forceCollapsable` cascade; full tree visible on any API page
- `styles/base.css`: legacy `[data-slot=footer-text]` rules removed

### StatsBanner

- Re-enabled the `color` prop on `<Stat>` (was marked deprecated and silently ignored, causing all stats to render in `--foreground`)
- `color` resolves through the shared `legacyToGem` table (same mapping used by `FeatureCard` / `ValueProp`), so conventional names like `cyan` map to gem tokens
- Stat value text now uses a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow for legibility
- Each stat gains a thin gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

---

Adds a full-site footer with gem-accented navigation, fixes API reference URL routing so TypeDoc module links resolve correctly, sharpens landing page copy, and restores per-stat gem coloring in the stats banner.
