---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site footer, API routing, and landing copy

### Site footer

- Added `SiteFooter.astro`: structured brand lockup with three link columns (Docs, Packages, Community), version row, gem-tinted headings, and a foil accent rule; renders on every page
- Added `lib/packages.ts`: build-time workspace package discovery; drives footer Packages column and landing alpha-ribbon from a single source; suppresses badges that match the project baseline
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` to signal project-level alpha state to the corner ribbon
- Replaced the AI-disclaimer `footerText` string with the structured `SiteFooter` component; `footerText` cleared (retained for schema compat)
- Header wordmark: removed +2px vertical offset so it baselines with header text
- API sidebar: nested groups in the API reference are always-open (`forceCollapsable` cascade), giving full tree visibility on any API page
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- Added `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` segments from TypeDoc-generated link URLs
- `astro.config.mjs`: set `entryFileName: 'index'` so per-module files route to directory roots; wired `stripIndexLinks` into `markdown.remarkPlugins`; set `starlight.description` (feeds `SiteFooter` tagline and `<meta description>`)

### Landing copy

- Hero subtagline: removed em-dash; split into two short declaratives
- Section heading: "Built into three.js, not on top of it" changed to "Built for three.js"
- VP1 opener: dropped false-universal categorical claim; reworded to a specific observation
- StatsBanner: 10K+ changed to 20K+ sprites
- `HeroShader.tsx`: removed side vignette; gem flow now runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the `color` prop on `StatsBanner` stat items (was accepted but silently ignored)
- `color` resolves to a gem name via the same `legacyToGem` table used by `FeatureCard` and `ValueProp` (maps `cyan/blue/green/orange/red/yellow/purple` to gem equivalents)
- Stat value text is tinted with a gem-mixed color (65% gem + 35% foreground) and a soft gem text-shadow glow
- Each stat renders a thin gem-tinted hairline underline (gradient fading to transparent on the right); the four stats read as a colored chord across the row

Adds a structured site footer with gem-tinted columns, fixes API reference link routing so module URLs resolve to directory roots, refreshes landing copy for accuracy and voice, and restores gem color accents to the StatsBanner component.
