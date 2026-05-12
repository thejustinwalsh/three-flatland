---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**SiteFooter**
- New `SiteFooter.astro`: brand lockup with FL icon and "Flatland" wordmark, three link columns (Docs, Packages, Community), version row, gem-tinted section headings, foil-rule top accent; renders on every page including examples
- New `lib/packages.ts`: shared build-time workspace-package discovery; drives footer Packages column and landing alpha-ribbon from a single source; suppresses badges matching the project baseline, surfaces only divergent ones
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` field added to signal project-level alpha state to the corner ribbon

**API reference routing**
- New `typedoc-plugins/strip-index-links.mjs`: remark plugin that strips trailing `/index/` from typedoc-generated link URLs, fixing broken routes emitted when `entryFileName: index` is set
- `astro.config.mjs`: wired `entryFileName=index` and `stripIndexLinks` remark plugin; set `starlight.description` for footer tagline and meta description; cleared `footerText`

**Theme**
- `Header.astro`: removed +2px wordmark vertical offset so it baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups are now always-open via `forceCollapsable` cascade, making the full tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

**Landing copy**
- Section heading: "Built into three.js, not on top of it" -> "Built for three.js"
- VP1 opener: rewritten to drop false-universal categorical claim
- Hero subtagline: em-dash replaced with two short declaratives
- StatsBanner: sprite count updated from 10K+ to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- Re-enabled the previously ignored `color` prop on `StatsBanner` stat items; all four stats now render in their specified gem accent instead of `--foreground`
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, etc.) resolve directly; conventional color names (`cyan`, `blue`, `green`, etc.) map via `legacyToGem` for backwards compatibility
- Stat value text rendered in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat gains a thin gem-tinted hairline underline (gradient fading right) so the row reads as a colored chord

---

Adds a full site footer, fixes API reference link routing, restores gem color accents on the stats banner, and tightens landing copy.
