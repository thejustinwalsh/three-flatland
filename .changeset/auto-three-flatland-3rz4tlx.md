---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site footer

- Added `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row with gem-tinted headings and per-section hover colors
- Added `lib/packages.ts`: build-time workspace-package discovery shared between footer Packages column and landing alpha ribbon; suppresses badges matching project-wide baseline
- API reference links now resolve to directory roots — new `strip-index-links` remark plugin strips trailing `/index/` segments; `entryFileName: 'index'` set in TypeDoc config
- API reference sidebar groups always-open on any API page via `forceCollapsable` cascade in `SidebarSublist`
- Site `<meta description>` now populated from `starlight.description`; removed legacy AI-disclaimer `footerText`
- Header wordmark vertical offset removed; aligns with header baseline

### Landing page copy

- Hero subtagline: em-dash removed, split into two declaratives
- Section heading "Built into three.js" corrected to "Built for three.js"
- VP1 opener reframed to avoid false-universal categorical claim
- StatsBanner sprite count updated: 10K+ → 20K+
- Hero shader side vignette removed; gem flow runs edge-to-edge

### StatsBanner gem accents

- `color` prop on `StatsBanner` stats re-enabled (was accepted but ignored)
- Conventional color names (`cyan`, `blue`, `green`, etc.) map to gem equivalents via `legacyToGem` table; existing MDX call sites unchanged
- Stat value text tinted with gem color; each stat has a gem-tinted hairline underline (gradient fading right) so the four stats read as a colored chord across the row

Adds a structured site footer, fixes API reference URL routing, refreshes landing copy for accuracy, and restores gem accent colors to the stats strip.
