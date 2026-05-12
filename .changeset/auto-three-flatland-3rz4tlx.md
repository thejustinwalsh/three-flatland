---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Footer**
- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted headings with per-section hover colors, foil rule top accent — replaces the AI-disclaimer `footerText` placeholder
- New `lib/packages.ts`: single build-time source for workspace package discovery; drives both the footer Packages column and the landing alpha-ribbon; suppresses badges shared by every package (noise reduction)
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` added to signal project-level alpha state to the corner ribbon

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from TypeDoc-generated URLs so module links resolve to directory roots
- `astro.config.mjs`: `entryFileName=index`, `stripIndexLinks` plugin wired, `starlight.description` set (feeds footer tagline and `<meta>` description)

**Theme / layout**
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups always-open via `forceCollapsable` cascade — full tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

**Landing copy**
- Section heading corrected: "Built into three.js, not on top of it" → "Built for three.js" (prior wording implied an upstream fork)
- VP1 opener: drops false-universal categorical claim, now scoped to an observable condition
- Hero subtagline: em-dash removed above the fold; replaced with two short declaratives
- StatsBanner sprite count: 10K+ → 20K+ (M2 measured, accounts for pixel-shader-bound headroom)
- `HeroShader.tsx`: side vignette removed; gem flow now runs edge-to-edge

### StatsBanner

- Re-enabled the `color` prop on each stat (was marked deprecated and silently ignored; all four stats rendered in `--foreground` regardless of the gem name passed)
- `color` now resolves through the shared `legacyToGem` table (same mapping as `FeatureCard` / `ValueProp`)
- Stat value text rendered in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted `text-shadow` glow
- Each stat gains a thin gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

---

Adds a `SiteFooter` to the docs theme, fixes API reference URL routing, tightens landing copy accuracy, and restores gem-color rendering to `StatsBanner` stats.
