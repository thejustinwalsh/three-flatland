---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site footer

- Added `SiteFooter` component: brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted section headings, foil rule accent -- renders on every page including examples
- Added `lib/packages.ts`: shared build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges that match project baseline to reduce noise
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` field used by the alpha-ribbon component
- Header wordmark: removed +2px vertical offset so it baseline-aligns with surrounding header text
- Removed legacy `[data-slot=footer-text]` CSS rules

### API reference routing

- Added `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from generated TypeDoc link URLs, ensuring per-module index pages resolve to their directory root
- `astro.config.mjs`: set `entryFileName=index`, wired `stripIndexLinks` remark plugin, set `starlight.description` (feeds footer tagline and `<meta>` description), cleared `footerText`
- `SidebarSublist`: API ref nested groups are now always-open via `forceCollapsable` cascade -- full API tree visible on any API reference page

### Landing page copy

- Section heading: "Built into three.js, not on top of it" -> "Built for three.js" (previous wording implied an upstream fork/PR relationship)
- VP1 opener: reworded to drop false-universal categorical claim about all 2D rendering libraries
- Hero subtagline: replaced em-dash construction with two short declaratives
- StatsBanner: updated sprite count from 10K+ to 20K+
- `HeroShader.tsx`: removed side vignette; gem flow now runs edge-to-edge

### StatsBanner gem colors

- Re-enabled the `color` prop on `StatsBanner` stats (was deprecated/ignored, causing all stats to render in `--foreground`)
- `color` now resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text rendered with a 65/35 gem-foreground mix plus a soft gem-tinted `text-shadow` glow for legibility
- Each stat gets a gem-tinted hairline underline (gradient fading right) so the four stats read as a colored chord across the row

Adds a proper docs site footer with workspace-aware package discovery, fixes API reference link routing, tightens landing copy, and restores per-stat gem color accents in the stats banner.
