---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site — footer, API routing, landing copy, and gem-accented stats

### Site footer

- New `SiteFooter` component added to the starlight theme: brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted column headings with per-section hover colors, and a foil rule top accent
- Footer renders on every page (docs and examples), replacing the AI-disclaimer `footerText`
- New `lib/packages.ts` discovers workspace packages at build time; drives both the footer Packages column and the landing alpha-ribbon from a single source — divergent badges only, project-baseline badges suppressed
- `packages/three-flatland/package.json` gains `flatland.badge="Alpha"` to signal project-level alpha state to the ribbon

### API reference routing

- New `strip-index-links` remark plugin strips trailing `/index/` segments from typedoc-generated link URLs, fixing broken deep-links in the API reference (`/api/foo/src/index/` → `/api/foo/src/`)
- `astro.config.mjs` sets `entryFileName: 'index'`, wires the remark plugin, populates `starlight.description` (feeds footer tagline and meta description), and clears `footerText`
- API ref sidebar nested groups now always-open via `forceCollapsable` cascade — full tree visible on any API page

### Landing page copy

- Section heading corrected: "Built into three.js, not on top of it" → "Built for three.js" (removes false fork implication)
- VP1 opener rewritten to avoid false-universal categorical claim
- Hero subtagline: em-dash removed above the fold, replaced with two short declaratives
- StatsBanner sprite count updated: 10K+ → 20K+
- `HeroShader`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- `color` prop on `StatsBanner` stat items re-enabled (was accepted but silently ignored)
- Stat value text now renders in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat gets a gem-tinted hairline underline (linear-gradient fading right), making the four stats read as a colored chord across the row
- Conventional color names (`cyan`, `blue`, `green`, etc.) map to gems via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Header wordmark baseline fixed: dropped stray +2px offset so it aligns with header text

Adds a full site footer with auto-discovered package links, fixes API reference deep-linking, sharpens landing copy accuracy, and restores gem-tinted stat accents throughout the docs site.
