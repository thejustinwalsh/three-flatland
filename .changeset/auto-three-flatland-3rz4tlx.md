---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, and stat colors

### Site footer

- New `SiteFooter.astro`: structured footer with brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, and a foil-rule top accent
- New `lib/packages.ts`: reads `packages/*/package.json` at build time; drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project baseline (all-alpha = noise)
- `flatland.badge="Alpha"` field added to `packages/three-flatland/package.json` to signal project-level alpha state to the ribbon
- Replaced the legacy AI-disclaimer `footerText` string with the new structured footer component

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` segments from TypeDoc-generated links, so API module roots resolve correctly as directory-index pages in Astro
- `astro.config.mjs`: set `entryFileName: 'index'`, wired `stripIndexLinks` into `markdown.remarkPlugins`, added `starlight.description` (feeds footer tagline and `<meta description>`)

### Docs UI

- API reference sidebar: nested groups are always-open (`forceCollapsable` cascade in `SidebarSublist.astro`) — full tree visible on any API page
- Header wordmark: removed +2px vertical offset, aligns with header text baseline
- `StatsBanner`: `color` prop re-enabled (was marked deprecated and ignored) — gem name now tints the stat value text and adds a gem-tinted hairline underline beneath each stat; conventional color names (`cyan`, `blue`, `green`, etc.) map to their closest gem via `legacyToGem`
- Updated sprites stat: 10K+ -> 20K+

### Landing copy

- Hero subtagline rewritten as two short declaratives (removed em-dash)
- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js"
- VP1 opener revised to avoid a false-universal categorical claim
- `HeroShader.tsx`: side vignette removed; gem-flow shader runs edge-to-edge

Adds a structured site footer, fixes API reference link routing, and restores per-stat gem accent colors in the stats banner across the docs landing page.
