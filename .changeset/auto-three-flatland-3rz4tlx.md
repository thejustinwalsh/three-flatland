---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## Docs site

### Site footer
- New `SiteFooter` component on every page: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted column headings with per-section hover colors, and a cursor-driven foil rule at the top
- New `lib/packages.ts` utility discovers public workspace packages from `packages/*/package.json` at build time; drives the footer Packages column and the alpha-ribbon from one source — adding a new package surfaces it automatically
- Footer badge suppression: badges matching the project-wide baseline (currently Alpha) are hidden; only divergent states (preview, beta, deprecated) appear, reducing noise
- `packages/three-flatland/package.json` gains `flatland.badge = "Alpha"` to signal project-level alpha state to the ribbon and footer

### API reference routing
- New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` segments from typedoc-generated link URLs, fixing broken routes where Astro emits directory-root `index.html` pages
- `astro.config.mjs`: `entryFileName` set to `index`, `remarkStripIndexLinks` wired in, `starlight.description` populated (feeds footer tagline and meta description), legacy `footerText` cleared

### Docs theme
- `Header.astro`: removed +2px wordmark vertical offset; baseline now aligns with surrounding header text
- `SidebarSublist.astro`: API reference nested groups always-open via `forceCollapsable` cascade — full API tree visible on any API page
- `styles/base.css`: removed legacy `[data-slot=footer-text]` rules

### Landing page
- Hero subtagline: em-dash replaced with two short declaratives
- Section heading corrected: "Built into three.js, not on top of it" → "Built for three.js" (prior wording implied an upstream fork relationship)
- VP1 opener rewritten to drop a false-universal categorical claim about other 2D libraries
- StatsBanner sprite count updated: 10K+ → 20K+
- `HeroShader.tsx`: side vignette removed; gem flow now runs edge-to-edge

### StatsBanner gem accents
- Re-enabled the `color` prop on `StatsBanner` stat items — was marked deprecated and ignored, causing all four stats to render in `--foreground`
- `color` resolves through the same `legacyToGem` table used by `FeatureCard`/`ValueProp` (cyan/blue → diamond, green → emerald, red → ruby, etc.)
- Gem accent applied via `data-gem` attribute and CSS cascade rather than inline custom property assignment, working around a Safari `color-mix` resolution bug with double-indirected custom properties
- Stat value text colored directly from `--stat-accent`; thin hairline underline (gradient fading right) so the four stats read as a colored chord across the row

### Marketing voice skill
- Zero em-dashes above the fold (hero, headline, lede)
- Business/sales jargon ban: carve-out, table stakes, value prop, leverage (verb), at-scale, and similar
- Model enforcement: Opus for orchestration/research; Sonnet required for variant generation and persona reviews
- Audience-review workflow: 3 structurally distinct variants + 3 parallel persona reviewers mandatory for new copy beyond single-sentence edits
- Added validation rules blocking false-universal categorical claims and tooling-only features framed as runtime capabilities

`SiteFooter`, workspace package auto-discovery, and corrected API reference routing are the main deliverables; the StatsBanner gem accent fix and landing copy revisions sharpen the production-readiness of the docs site.
