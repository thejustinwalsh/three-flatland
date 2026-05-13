---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site footer, API reference routing, landing copy, and StatsBanner gem accents

### Docs theme

- New `SiteFooter` component: brand lockup (FL | flatland), three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, foil top-rule accent — renders on every page
- New `lib/packages.ts`: build-time workspace-package discovery; drives both footer Packages column and landing alpha-ribbon from one source; suppresses badges shared by all packages (noise reduction), surfaces only divergent ones
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` marks project-level alpha state for the corner ribbon
- `Header.astro`: removed stray +2px wordmark baseline offset
- `SidebarSublist.astro`: API reference nested groups are always-open so the full tree is visible on any API page
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- New `strip-index-links.mjs` remark plugin: strips trailing `/index/` segments from TypeDoc-generated link URLs, so module root pages resolve cleanly as directory roots
- `astro.config.mjs`: `entryFileName: 'index'` aligns TypeDoc output with Astro directory routing; `stripIndexLinks` wired into `remarkPlugins`; `starlight.description` set (feeds footer tagline and `<meta description>`); legacy `footerText` cleared

### Landing page copy

- Hero subtagline: removed em-dash, rewritten as two short declaratives
- Section heading corrected: "Built into three.js, not on top of it" → "Built for three.js" (prior wording implied a fork/upstream PR relationship)
- Value prop opener: dropped false-universal categorical claim
- StatsBanner: sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs to canvas edges

### StatsBanner gem accents

- Re-enabled `color` prop on `StatsBanner` stat items (was accepted but silently ignored)
- Gem resolution via `legacyToGem` table — conventional color names (`cyan`, `blue`, `green`, etc.) map to gem names, consistent with `FeatureCard` / `ValueProp`
- Per-stat `--stat-accent` CSS custom property set inline from the resolved gem
- Stat value text uses a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Thin gem-tinted hairline underline (gradient fading right) beneath each stat; four stats read as a colored chord across the row

Adds a structured site footer, fixes API reference link routing, tightens landing copy, and restores gem accent coloring to the stats banner.
