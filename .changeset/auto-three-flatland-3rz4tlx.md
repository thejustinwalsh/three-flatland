---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, stat gem colors

### Site footer

- New `SiteFooter.astro`: brand lockup (FL | Flatland wordmark), three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-column hover colors, and a foil rule top accent; replaces the AI-disclaimer `footerText` and renders on every page
- New `packages/starlight-theme/lib/packages.ts`: reads `packages/*/package.json` at build time to drive both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project baseline (alpha-everywhere = noise)
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` field so the corner ribbon reflects project-level alpha state
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API reference nested groups forced always-open via `forceCollapsable` cascade, so the full tree is visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

### API reference routing

- New `docs/typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from generated TypeDoc link URLs, pairing with `entryFileName=index` so module index pages resolve to directory roots rather than `/index/` subpaths
- `astro.config.mjs`: wired `stripIndexLinks` plugin, set `entryFileName=index`, populated `starlight.description` (feeds footer tagline and meta description), cleared `footerText`

### Landing copy

- Section heading corrected: "Built into three.js, not on top of it" -> "Built for three.js" (avoids implying an upstream fork/PR relationship)
- VP1 opener rewritten: drops false-universal categorical claim about all 2D libraries
- Hero subtagline: removed em-dash; replaced with two short declaratives
- StatsBanner: sprite count updated 10K+ -> 20K+
- `HeroShader.tsx`: side vignette removed; gem flow renders edge-to-edge

### StatsBanner gem colors (previously broken)

- Re-enabled `color` prop on `StatsBanner` stats; was marked deprecated and silently ignored, causing all four stats to render in `--foreground`
- Color resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text now renders with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted text-shadow glow
- Each stat gets a thin gem-tinted hairline underline (gradient fading right) so the four stats read as a colored chord across the row

Adds a site-wide footer, fixes API reference link routing, corrects landing copy accuracy, and restores gem accent colors to the stats banner.
