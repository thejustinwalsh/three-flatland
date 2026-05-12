---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

**Site footer**

- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, and foil-rule top accent — rendered on every page including docs and examples
- New `lib/packages.ts` reads `packages/*/package.json` at build time; drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project-wide baseline
- `three-flatland/package.json` gains `flatland.badge="Alpha"` field consumed by the corner ribbon
- Header wordmark: removed +2px vertical offset so it baseline-aligns with surrounding header text
- API reference sidebar: nested groups forced open so the full tree is visible on any API page
- Removed legacy `[data-slot=footer-text]` CSS rules

**API reference routing**

- New remark plugin `strip-index-links.mjs` strips trailing `/index/` from TypeDoc-generated URLs
- `astro.config.mjs`: `entryFileName=index` + `stripIndexLinks` wired so per-module index pages resolve at their directory roots instead of `/index/` subpaths
- `starlight.description` set; feeds `SiteFooter` tagline and `<meta description>`

**Landing page copy**

- Section heading changed from "Built into three.js, not on top of it" to "Built for three.js" — removes false implication of an upstream fork/PR relationship
- VP1 opener reworded to drop a false-universal categorical claim about other 2D libraries
- Hero sub-tagline: em-dash replaced with two short declaratives
- StatsBanner sprite count updated: 10K+ to 20K+
- Hero shader: side vignette removed; gem color flow runs edge-to-edge

**StatsBanner gem colors**

- `color` prop on `<Stat>` re-enabled after being incorrectly deprecated and ignored; all four stats now respect the gem name passed from MDX (diamond, pink, gold, amethyst, etc.)
- Stat value text renders in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow
- Each stat gets a thin gem-tinted hairline underline (linear gradient fading right) so the stats row reads as a colored chord rather than a flat band

Adds a site-wide footer, fixes API reference URL routing so TypeDoc links resolve correctly, restores gem accent colors on `StatsBanner`, and corrects factually inaccurate landing page copy.
