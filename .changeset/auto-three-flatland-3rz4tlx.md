---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site — footer, API routing, landing copy, StatsBanner gem colors

### Site footer

- New `SiteFooter.astro` component with brand lockup (FL | Flatland), three link columns (Docs, Packages, Community), version row, gem-tinted section headings, per-section hover colors, and a foil rule top accent; renders on every page including examples
- New `lib/packages.ts` — shared build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project baseline (all-alpha = noise)
- `flatland.badge="Alpha"` field added to `packages/three-flatland/package.json` to signal project-level alpha state for the corner ribbon
- Removed legacy `[data-slot=footer-text]` CSS rules and cleared `footerText` from Astro config

### API reference routing

- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from generated TypeDoc link URLs, fixing double-path issues when `entryFileName=index` is used
- `astro.config.mjs`: `entryFileName` set to `index`, `stripIndexLinks` wired into `remarkPlugins`, `starlight.description` set (feeds footer tagline and meta description)
- API ref sidebar nested groups now always-open via `forceCollapsable` cascade in `SidebarSublist.astro` — full tree visible on any API page

### Landing copy corrections

- Section heading: "Built into three.js, not on top of it" corrected to "Built for three.js" (prior wording implied an upstream fork)
- VP1 opener rewritten to drop a false-universal categorical claim
- Hero subtagline: removed em-dash in favor of two short declaratives
- StatsBanner sprite count updated: 10K+ -> 20K+ (reflects measured throughput)
- `HeroShader.tsx`: side vignette removed so gem flow runs edge-to-edge

### StatsBanner gem colors (restored)

- `color` prop on `StatsBanner` stats was silently ignored; now correctly resolves to a gem accent via the same `legacyToGem` table used by `FeatureCard` and `ValueProp`
- Stat value text rendered with a 65/35 gem-to-foreground color mix plus a soft gem-tinted text-shadow glow
- Thin gem-tinted hairline underline (gradient fading right) added per stat so the four stats read as a colored chord across the row

Adds a site footer with gem-accented navigation, fixes API reference link routing, corrects landing copy accuracy, and restores gem color rendering in the stats banner.
