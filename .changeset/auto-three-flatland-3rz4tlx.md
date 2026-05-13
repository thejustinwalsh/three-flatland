---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

- Added `SiteFooter` with brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted headings, per-section hover colors, and foil rule top accent; renders on every page
- Added `lib/packages.ts`: build-time workspace-package discovery driving both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project baseline
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` to signal project-level alpha state to the corner ribbon
- API ref sidebar groups are now always-open (`forceCollapsable` cascade in `SidebarSublist.astro`) -- full tree visible on any API page
- Fixed header wordmark vertical alignment (removed stray +2px offset)
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from generated TypeDoc link URLs so module pages resolve to their directory roots
- `astro.config.mjs`: set `entryFileName=index`, wired `stripIndexLinks` remark plugin, set `starlight.description` for footer tagline and meta description, cleared `footerText`

### Landing copy

- Section heading corrected: "Built into three.js, not on top of it" -> "Built for three.js" (previous wording implied an upstream fork)
- VP1 opener rewritten to drop a false-universal categorical claim
- Hero subtagline: replaced em-dash construction with two short declaratives
- StatsBanner sprite count updated: 10K+ -> 20K+
- `HeroShader.tsx`: removed side vignette; gem flow now runs edge-to-edge

### StatsBanner color prop

- Re-enabled the `color` prop on each stat (was silently ignored, causing all stats to render in `--foreground`)
- Gem names resolve through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`; conventional color aliases (cyan, blue, green, etc.) map correctly
- Stat value text rendered with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted text-shadow glow
- Each stat now has a gem-tinted hairline underline (gradient fading right) -- four stats read as a colored chord across the row

Adds a site-wide footer, fixes API reference link routing, corrects landing copy accuracy, and restores gem-color accents to the stats banner.
