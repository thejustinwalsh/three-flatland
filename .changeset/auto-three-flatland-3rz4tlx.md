---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Footer**
- Added `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, and a foil-ruled top accent — renders on every page
- Added `lib/packages.ts`: build-time workspace-package discovery driving both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project-wide baseline to reduce noise
- Added `flatland.badge="Alpha"` to `packages/three-flatland/package.json` to signal project-level alpha state to the corner ribbon
- Removed legacy `[data-slot=footer-text]` CSS rules

**API reference**
- Added `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from generated TypeDoc link URLs so module index pages are reached at their directory root
- Set `entryFileName=index` in `astro.config.mjs`; wired `stripIndexLinks` plugin; set `starlight.description` to feed the footer tagline and meta description

**Sidebar**
- API reference nested groups now always-open via `forceCollapsable` cascade in `SidebarSublist`; the full type tree is visible without expanding nodes manually
- Fixed wordmark vertical offset in `Header.astro` — baseline now aligns with header text

**Landing copy**
- Section heading: "Built into three.js, not on top of it" changed to "Built for three.js" (prior wording implied an upstream fork)
- VP1 opener reworded to drop a false-universal claim about all 2D rendering libraries
- Hero subtagline: removed em-dash, replaced with two short declaratives
- `StatsBanner`: sprite count updated to 20K+
- `HeroShader`: side vignette removed; gem flow extends edge-to-edge

### StatsBanner

- Re-enabled the `color` prop on stat items (was marked deprecated and silently ignored, causing all four stats to render in `--foreground`)
- `color` resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`, mapping conventional color names to gem tokens
- Stat value text renders in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted glow
- Each stat now has a gem-tinted hairline underline (linear gradient fading right) so the stat row reads as a colored chord

---

Site footer, API reference link routing, always-open API sidebar, and per-gem color accents on `StatsBanner` stats. Landing copy corrected to remove a false-universal claim and an implied fork relationship.
