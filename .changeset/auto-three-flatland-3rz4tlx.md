---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs theme & site

**SiteFooter**
- New `SiteFooter.astro` component: brand lockup, three-column link grid (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, foil rule top accent
- Renders on every page; replaces the previous AI-disclaimer `footerText`

**Package discovery**
- New `packages/starlight-theme/lib/packages.ts`: reads `packages/*/package.json` at build time; single source driving the footer Packages column and the landing alpha-ribbon
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` to surface project-level alpha state in the corner ribbon; suppresses badges that match the project baseline to reduce noise

**API reference routing**
- New `docs/typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from TypeDoc-generated link URLs so module pages resolve to directory roots
- `astro.config.mjs`: set `entryFileName=index`, wired `stripIndexLinks` plugin, set `starlight.description` (feeds footer tagline and `<meta>` description), cleared `footerText`
- `SidebarSublist.astro`: API reference nested groups are always-open via `forceCollapsable` cascade

**Header & styles**
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

## Landing page

- Hero subtagline: removed em-dash; rewritten as two short declaratives
- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" (previous wording implied an upstream fork relationship)
- VP1 opener rewritten to avoid a false universal categorical claim about other 2D libraries
- StatsBanner sprite count updated: 10K+ -> 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

## StatsBanner

- Restored `color` prop on `<Stat>`: was marked deprecated and ignored, causing all four stats to render in `--foreground` regardless of the gem name passed in MDX
- `color` now resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text rendered with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted `text-shadow` glow
- Each stat now has a gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

Adds a structured `SiteFooter` with workspace-package-driven content, fixes API reference link routing, and restores gem accent colors in `StatsBanner`.
