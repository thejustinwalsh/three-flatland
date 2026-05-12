---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site — footer, API routing, landing copy

**Site footer**
- New `SiteFooter` component with brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings, and foil rule accent; renders on every page
- `lib/packages.ts`: shared build-time workspace-package discovery; drives footer Packages column and landing alpha-ribbon from one source; suppresses badges shared by all packages (reduces noise)
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` field; read by the corner ribbon
- Legacy `[data-slot=footer-text]` CSS rules removed; `footerText` config cleared (replaced by `SiteFooter`)

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` segments from generated TypeDoc link URLs
- `astro.config.mjs`: `entryFileName: 'index'` so module roots route cleanly; `stripIndexLinks` wired into `markdown.remarkPlugins`; `starlight.description` set (feeds `<meta description>` and footer tagline)

**Docs navigation**
- API ref sidebar nested groups always-open via `forceCollapsable` cascade — full tree visible on any API page
- Header wordmark `+2px` offset removed; baseline now aligns with header text

**Landing page copy**
- Hero subtagline rewritten as two short declaratives (em-dash removed)
- Section heading "What ships in three-flatland" renamed to "Features"
- VP1 opener: drops false-universal categorical claim about 2D libraries
- StatsBanner: sprite count updated to 20K+; "Forward+ Tiled lighting" replaced with "Auto Instanced GPU batches"
- Hero shader side vignette removed; gem flow runs edge-to-edge
- Feature card copy tightened across Sprites, ECS, R3F, and Pixel-art cards

**StatsBanner gem accent (`color` prop re-enabled)**
- `color` prop on `StatItem` was previously deprecated and ignored; all stats rendered in `--foreground`
- `color` now resolves to a gem name via `legacyToGem` table (matching `FeatureCard`/`ValueProp` behavior)
- Stat value text rendered with gem-mixed color (65% gem + 35% foreground) and soft gem-tinted text-shadow glow
- Thin gem-tinted hairline underline (gradient fading right) added beneath each stat; four stats read as a colored chord

Adds a structured site footer, fixes API reference link routing, refreshes landing copy for accuracy, and restores per-stat gem accents in the stats banner.
