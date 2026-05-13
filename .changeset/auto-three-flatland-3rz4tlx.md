---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, and stats gem colors

### Site footer

- New `SiteFooter` component replaces the placeholder AI-disclaimer footer on every docs and examples page
- Brand lockup with FL icon, "flatland" wordmark, and tagline driven by `starlight.description` in `astro.config.mjs`
- Three link columns: Docs, Packages (auto-discovered from workspace `package.json` files), Community
- Gem-tinted section headings with per-column hover colors; foil rule top accent
- New `lib/packages.ts` reads all workspace `packages/*/package.json` at build time — single source of truth for both the footer Packages column and the landing alpha-ribbon; suppresses badges matching the project-wide baseline to reduce noise
- `packages/three-flatland/package.json` gains `flatland.badge = "Alpha"` to signal project-level alpha state to the ribbon

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` segments from TypeDoc-generated URLs
- `astro.config.mjs`: `entryFileName` set to `index` so per-module pages are routed as directory roots; `stripIndexLinks` wired into `remarkPlugins`; `starlight.description` populated

### Docs theme fixes

- Header wordmark offset removed; baseline now aligns with adjacent header text
- API reference sidebar nested groups expand automatically (`forceCollapsable` cascade) so the full tree is visible on any API page
- Legacy `[data-slot=footer-text]` CSS rules removed

### Landing page copy

- Hero subtagline: em-dash replaced with two short declaratives (cleaner above-the-fold voice)
- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" (prior wording implied an upstream fork)
- Value-prop opener rewritten to avoid a false-universal categorical claim
- `StatsBanner` sprite count updated to 20K+ (was 10K+)
- `HeroShader`: side vignette removed; gem flow now runs edge-to-edge

### StatsBanner gem accent colors

- `color` prop on `StatsBanner` stat items re-enabled after being silently ignored
- Conventional color names (`cyan`, `blue`, `green`, etc.) map to gem equivalents via `legacyToGem`; existing MDX call sites continue to compile unchanged
- Stat value text rendered with a gem-mixed color (65% gem / 35% foreground) plus a soft gem-tinted glow
- Thin gem-tinted hairline underline added beneath each stat; four stats read as a colored chord across the row

Footer, API link routing, and gem-accented stats land together as the docs-refresh foundation; the `color` prop on `StatsBanner` is restored to full function with backward-compatible legacy color aliases.
