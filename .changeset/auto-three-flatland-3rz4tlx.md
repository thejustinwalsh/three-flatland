---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site

**SiteFooter** (new component): brand lockup with three link columns (Docs, Packages, Community), version row, gem-tinted headings, and per-section hover colors. Replaces the old AI-disclaimer `footerText` and appears on every page.

**Workspace package discovery** (`lib/packages.ts`): reads `packages/*/package.json` at build time; drives both the footer Packages column and the landing alpha-ribbon from a single source. Suppresses badges that match the project-wide baseline (all-alpha = noise).

**API reference routing**: new `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from generated TypeDoc URLs so per-module pages resolve correctly as directory roots. Wired via `astro.config.mjs` alongside `entryFileName=index`.

**Docs sidebar**: API ref nested groups are now always-open (`forceCollapsable` cascade in `SidebarSublist.astro`) — full API tree visible on any reference page.

**Landing copy corrections**:
- Section heading: "Built into three.js" -> "Built for three.js" (avoids implying an upstream fork/PR relationship)
- VP1 opener reworded to remove a false-universal categorical claim
- Hero subtagline: em-dash dropped in favour of two short declaratives
- Stats banner: sprite count updated to 20K+
- Hero shader: side vignette removed; gem flow runs edge-to-edge

**Cleanup**: legacy `[data-slot=footer-text]` CSS rules removed; wordmark header offset corrected; `starlight.description` set (feeds footer tagline and `<meta description>`).

## StatsBanner

- `color` prop re-enabled (was marked deprecated and silently ignored — all four stats rendered in `--foreground`)
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) resolve directly; conventional aliases (`cyan`, `blue`, `green`, etc.) map via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text rendered in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted `text-shadow` glow
- Thin gem-tinted hairline underline (linear gradient fading right) added beneath each stat so the four stats read as a colored chord across the row

Adds a custom `SiteFooter` to the docs theme, fixes API reference URL routing, corrects landing page copy accuracy, and restores gem color accents to the stats banner.
