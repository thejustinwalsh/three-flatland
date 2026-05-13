---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Footer**
- New `SiteFooter` on every page: brand lockup (FL | Flatland), Docs / Packages / Community link columns, version row, gem-tinted section headings with per-section hover colors, foil rule accent at top
- `lib/packages.ts`: single build-time source of truth for workspace packages — drives both the footer Packages column and the landing alpha-ribbon; suppresses badges that match the project-wide baseline to reduce noise

**API reference routing**
- New `strip-index-links` remark plugin removes trailing `/index/` from generated TypeDoc URLs, so API module pages link to their directory roots rather than `/module/index/` subpaths
- `astro.config.mjs`: `entryFileName=index`, plugin wired in, `starlight.description` set (feeds footer tagline and `<meta description>`)

**Landing copy**
- Section heading: "Built into three.js, not on top of it" → "Built for three.js" (prior wording implied an upstream fork/PR relationship)
- VP1 opener reworded to drop a false-universal categorical claim
- Hero subtagline: em-dash removed, replaced with two short declaratives
- StatsBanner sprite count updated to 20K+
- `HeroShader`: side vignette removed; gem flow now runs edge-to-edge

**StatsBanner**
- Re-enabled the `color` prop on each stat (was marked deprecated and silently ignored, causing all four stats to render in `--foreground`)
- Stat value text now uses a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted glow
- Thin gem-tinted hairline underline per stat (gradient fading right) so the stat row reads as a colored chord

**Theme polish**
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups are always-open via `forceCollapsable` cascade — full tree visible on any API page
- Removed legacy `[data-slot=footer-text]` CSS rules

Adds a site footer and fixes API reference URL routing; stat gem colors now apply as intended across the landing page stats banner.
