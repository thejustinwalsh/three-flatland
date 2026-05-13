---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site

### Footer
- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted headings with per-section hover colors, foil rule top accent; renders on every page
- New `lib/packages.ts`: build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges shared across all packages to reduce noise
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` marks project-level alpha state for the corner ribbon

### API reference
- New `typedoc-plugins/strip-index-links.mjs` remark plugin: strips trailing `/index/` from generated TypeDoc link URLs so module index pages resolve as directory roots
- `astro.config.mjs`: `entryFileName=index`, `stripIndexLinks` plugin wired, `starlight.description` set (feeds footer tagline and meta description), `footerText` cleared

### Theme refinements
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups always expand via `forceCollapsable` cascade; full tree visible on any API reference page
- Removed legacy `[data-slot=footer-text]` rules from `base.css`

### Landing copy
- Section heading: "Built into three.js, not on top of it" changed to "Built for three.js" (prior wording implied an upstream fork)
- VP1 opener rewritten to avoid a false-universal categorical claim about all 2D rendering libraries
- Hero subtagline: em-dash removed above the fold; replaced with two short declaratives
- `StatsBanner`: sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem colors
- Re-enabled the `color` prop on each stat (was marked deprecated and silently ignored)
- Per-stat `--stat-accent` set inline from the resolved gem name; conventional color names mapped via the same `legacyToGem` table used by `FeatureCard` / `ValueProp`
- Stat value text rendered with gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted text-shadow glow
- Thin gem-tinted hairline underline per stat (linear gradient fading right) so stats read as a colored chord across the row

Adds a site-wide footer, fixes API reference link routing, restores gem coloring on stats, and refines landing copy for accuracy.
