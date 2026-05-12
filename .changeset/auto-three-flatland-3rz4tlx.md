---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site

### Footer

- New `SiteFooter` component: brand lockup with Docs, Packages, and Community link columns, version row, gem-tinted section headings, foil rule top accent
- Replaces the AI-disclaimer `footerText`; renders on all pages including examples
- `lib/packages.ts`: build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project baseline

### API reference

- New `strip-index-links.mjs` remark plugin: strips trailing `/index/` from TypeDoc-generated URLs so API links resolve to directory roots
- `astro.config.mjs`: `entryFileName=index`, remark plugin wired, site description set (feeds footer tagline and meta description), `footerText` cleared
- API reference sidebar groups always open on any API page via `forceCollapsable` cascade in `SidebarSublist.astro`

### Landing page

- Hero subtagline rewritten as two short declaratives (removed em-dash)
- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js"
- VP1 opener reframed to avoid false-universal categorical claim
- StatsBanner sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner

- Re-enabled `color` prop on each stat (was deprecated and ignored; all stats were rendering in `--foreground`)
- Color resolves through the same `legacyToGem` table used by `FeatureCard` / `ValueProp`
- Stat value text rendered in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted glow
- Gem-tinted hairline underline per stat creates a colored chord across the row

### Theme

- `Header.astro`: removed +2px wordmark offset; baseline-aligns with header text
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` for the landing alpha-ribbon

Adds a site footer, fixes API reference link routing, tightens landing copy, and restores gem-color accents to the stats banner.
