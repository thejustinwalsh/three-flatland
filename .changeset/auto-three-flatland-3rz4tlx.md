---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**SiteFooter**
- New `SiteFooter.astro` component: brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted column headings with per-section hover colors, foil top rule
- Replaces the old AI-disclaimer `footerText` string; renders on every page including docs and examples
- New `lib/packages.ts`: reads `packages/*/package.json` at build time; drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project baseline (all alpha = noise)
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` to signal project-level alpha state to the corner ribbon

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` segments from TypeDoc-generated URLs so module links resolve to Astro directory roots
- `astro.config.mjs`: set `entryFileName: 'index'`, wired `stripIndexLinks` in `markdown.remarkPlugins`, added site `description` (feeds `<meta description>` and `SiteFooter` tagline), cleared `footerText`

**Theme polish**
- `Header.astro`: removed +2px wordmark vertical offset — wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups are always-open via `forceCollapsable` cascade; full API tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

**Landing copy**
- Hero subtagline: removed em-dash; rewritten as two short declaratives
- Section heading: "Built into three.js, not on top of it" → "Built for three.js"
- VP1 opener: dropped false-universal categorical claim; rewritten as specific problem statement
- StatsBanner sprite count: 10K+ → 20K+
- `HeroShader.tsx`: removed side vignette — gem flow now runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the `color` prop on `StatsBanner` stat items (was marked deprecated and silently ignored)
- Each stat resolves its `color` to a gem via a `legacyToGem` table (e.g. `cyan` → `diamond`, `red` → `ruby`) consistent with `FeatureCard` and `ValueProp`
- Stat value text uses a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted `text-shadow` glow for legibility
- Thin gem-tinted hairline underline (gradient fading right to transparent) added per stat; four stats read as a colored chord across the banner row
- README: section heading "Why three-flatland?" → "Why Flatland?"

Adds a structured site footer, fixes API reference URL routing, and brings full gem-color taxonomy to the landing stats banner.
