---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## docs: site footer, API routing, landing copy, and stats gem accents

### Site footer

- New `SiteFooter` component renders on every page with brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, and a cursor-driven foil rule at the top
- New `lib/packages.ts` discovers all public workspace packages at build time; drives the footer Packages column and the alpha-ribbon from a single source
- Footer badges suppressed for packages at the project-level baseline (all-alpha = noise); only divergent badges shown
- `packages/three-flatland/package.json`: added `flatland.badge="Alpha"` to signal project-level alpha state to the corner ribbon
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API reference nested groups always-open via `forceCollapsable` cascade; full tree visible on any API page
- Removed legacy `[data-slot=footer-text]` rules from `styles/base.css`

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from generated TypeDoc link URLs, pairing with `entryFileName=index` so module index pages resolve as directory roots
- `astro.config.mjs`: wired `stripIndexLinks`, set `entryFileName=index`, added `starlight.description` (feeds footer tagline and meta description), cleared `footerText`

### Landing copy

- Section heading changed to "Built for three.js" (previous wording implied a fork/upstream relationship)
- ValueProp opener reworded to drop a false-universal categorical claim
- Hero subtagline: removed em-dash; rewritten as two short declaratives
- StatsBanner: sprites stat updated from 10K+ to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow now runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the `color` prop on `StatsBanner` stats -- was marked deprecated and ignored, causing all four stats to render in `--foreground` regardless of the gem name passed in MDX
- `color` resolves to a gem via the shared `legacyToGem` table (cyan/blue -> diamond, green -> emerald, etc.)
- Per-stat `--stat-accent` set via `data-gem` CSS cascade (workaround for a Safari `color-mix` + chained custom property resolution bug)
- Stat value text now renders in the gem color; each stat has a gem-tinted gradient hairline underline fading to transparent on the right

Adds a proper site footer with workspace-package auto-discovery, fixes API reference link routing, tightens landing copy, and restores gem color accents to the stats strip.
