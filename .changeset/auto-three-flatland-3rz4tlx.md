---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Site footer**
- New `SiteFooter` component replaces the legacy `footerText` string: brand lockup, three link columns (Docs, Packages, Community), version row, and gem-tinted headings with per-section hover colors
- `lib/packages.ts` (new): build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges matching the project-wide baseline to reduce noise

**API reference routing**
- New `strip-index-links` remark plugin removes trailing `/index/` segments from TypeDoc-generated links so module roots resolve cleanly (e.g., `/api/three-flatland/src/` instead of `/api/three-flatland/src/react/index/`)
- `entryFileName: 'index'` set in TypeDoc config; `stripIndexLinks` wired into `markdown.remarkPlugins`
- Site `description` added to Starlight config; feeds `<meta description>` and the `SiteFooter` tagline

**Theme**
- `SidebarSublist`: API ref nested groups forced open via `forceCollapsable` cascade -- full tree visible on any API page
- `Header`: removed +2px wordmark offset; baseline now aligns with surrounding header text

**Landing copy**
- Hero subtagline: removed em-dash; rewritten as two short declaratives ("2D primitives for three.js or react-three-fiber. Instanced batching, composable TSL effects.")
- Section heading "Built into three.js, not on top of it" changed to "Built for three.js" (avoids implying an upstream fork)
- ValueProp opener rewritten to remove false-universal categorical claim
- `StatsBanner`: 10K+ changed to 20K+ sprites; "Forward+ Tiled lighting" changed to "Auto Instanced GPU batches"
- Feature cards updated: Lighting/shadows card replaced with Pixel-art rendering; effect count 30+ changed to 50+
- `HeroShader`: side canvas vignette removed; gem flow now runs edge-to-edge

**StatsBanner color prop**
- `color` prop on `StatItem` was deprecated/ignored; re-enabled with full gem resolution
- Conventional color names (`cyan`, `blue`, `green`, etc.) map to gem equivalents via `legacyToGem`
- Stat value text colored as 65% gem + 35% foreground with a soft gem-tinted `text-shadow` glow
- Thin gem-tinted hairline underline (linear gradient fading right) added beneath each stat; four stats read as a colored chord across the row

---

Adds a structured site footer, fixes API reference link routing, restores per-stat gem colors in `StatsBanner`, and refines landing copy for accuracy and voice consistency.
