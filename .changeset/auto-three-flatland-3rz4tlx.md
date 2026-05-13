---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, and stats colors

### Site footer

- New `SiteFooter` component with brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted section headings, per-section hover colors, and foil rule top accent — replaces the AI-disclaimer `footerText`
- New `lib/packages.ts` reads `packages/*/package.json` at build time; drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges matching the project baseline (all-alpha = noise)
- `packages/three-flatland/package.json`: added `flatland.badge = "Alpha"` to signal project-level alpha state to the corner ribbon

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from generated TypeDoc link URLs, so module index pages resolve at directory roots instead of `/index/` subpaths
- `astro.config.mjs`: set `entryFileName=index`, wired `stripIndexLinks` remark plugin, populated `starlight.description` (feeds footer tagline and meta description), cleared `footerText`

### Landing copy corrections

- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" -- removes implied upstream fork/PR relationship
- VP1 opener rewritten to drop false-universal categorical claim
- Hero subtagline: em-dash removed above the fold; replaced with two short declaratives
- Stats banner: sprite count updated from 10K+ to 20K+
- `HeroShader`: side vignette removed; gem flow now runs edge-to-edge

### Docs theme polish

- `Header.astro`: removed +2px wordmark vertical offset; baseline now aligns with header text
- `SidebarSublist.astro`: API ref nested groups always-open via `forceCollapsable` cascade -- full tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

### StatsBanner gem colors

- Re-enabled the `color` prop on `StatsBanner` stats (was deprecated and ignored; all stats rendered in `--foreground` regardless of the gem name passed)
- Gem name resolves through the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text renders with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted text-shadow glow
- Each stat carries a hairline gem-tinted underline (linear-gradient fading right) so the four stats read as a colored chord across the row

The docs site gains a full site footer, clean API reference URLs, corrected landing copy, and per-stat gem accent colors throughout the stats banner.
