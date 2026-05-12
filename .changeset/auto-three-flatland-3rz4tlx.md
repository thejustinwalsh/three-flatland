---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site: footer, API routing, landing copy, StatsBanner color

### Site footer

- New `SiteFooter.astro`: brand lockup (FL | Flatland wordmark), three-column link grid (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, foil top-rule accent -- renders on every page
- New `lib/packages.ts`: build-time workspace-package discovery; drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project baseline, surfaces only divergent ones
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` field added to signal project-level alpha state for the corner ribbon
- `Header.astro`: removed +2px wordmark offset so the FL mark baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups now always-open via `forceCollapsable` cascade -- full tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from generated TypeDoc link URLs, pairing with `entryFileName=index` so per-module index files resolve to directory roots
- `astro.config.mjs`: wired `entryFileName=index`, `stripIndexLinks` remark plugin, and `starlight.description` (feeds footer tagline + meta description); cleared `footerText`

### Landing copy corrections

- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" -- "built into" implied an upstream fork relationship that does not exist
- VP1 opener rewritten to remove a false-universal categorical claim about all 2D rendering libraries
- Hero subtagline: em-dash removed above the fold; replaced with two short declaratives
- `StatsBanner`: sprite count updated from 10K+ to 20K+ (reflects measured throughput on M2)
- `HeroShader.tsx`: side vignette removed; gem gradient now runs edge-to-edge

### StatsBanner gem colors restored

- `color` prop on `<Stat>` was marked deprecated and ignored -- all stats rendered in `--foreground` regardless of gem name passed from MDX
- Re-enabled: `color` resolves to a gem token (legacy names like `cyan`/`blue`/`green` mapped via the same `legacyToGem` table used by `FeatureCard`/`ValueProp`)
- Per-stat `--stat-accent` CSS variable now set inline from the resolved gem
- Stat value text rendered with a gem-mixed color (65% gem + 35% foreground) and a soft gem-tinted `text-shadow` glow
- Thin gem-tinted hairline underline (linear-gradient fading right) added under each stat so the four stats read as a colored chord across the row

Adds a full-width branded site footer, fixes API reference URL generation, corrects inaccurate landing copy, and restores gem accent colors to the stats banner.
