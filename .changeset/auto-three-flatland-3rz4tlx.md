---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33


### Docs site

**SiteFooter**
- New `SiteFooter.astro` component with brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted headings, and per-section hover colors
- Replaces the old AI-disclaimer `footerText`; renders on every page including examples
- New `lib/packages.ts` reads `packages/*/package.json` at build time to drive both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match the project-wide baseline (alpha) to reduce noise

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from generated TypeDoc link URLs
- `astro.config.mjs`: `entryFileName=index`, `remarkPlugins` wired with `stripIndexLinks`, `starlight.description` set for footer tagline and meta description
- API ref nested sidebar groups now always-open via `forceCollapsable` cascade — full tree visible on any API page

**Landing page copy**
- Section heading corrected: "Built into three.js, not on top of it" -> "Built for three.js"
- Value prop opener rewritten to drop false-universal categorical claim
- Hero subtagline: em-dash replaced with two short declaratives
- Stats banner: sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

**Theme / layout fixes**
- `Header.astro`: removed +2px wordmark offset; baseline now aligns with header text
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` added to signal project-level alpha state for the corner ribbon

### StatsBanner

- Re-enabled the `color` prop on `StatItem` (was deprecated and ignored; all stats rendered in `--foreground` regardless of gem name passed from MDX)
- `color` now resolves to a gem via `legacyToGem` (maps cyan/blue -> diamond, green -> emerald, orange/yellow -> gold, red -> ruby, purple -> amethyst), consistent with `FeatureCard` / `ValueProp`
- Stat value text rendered in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat gets a thin gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

This release ships the docs site footer, fixes API reference link routing, corrects landing page copy accuracy, and restores gem color accents to the stats banner.
