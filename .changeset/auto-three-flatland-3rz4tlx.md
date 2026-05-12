---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted headings with per-section hover colors; renders on every page
- New `lib/packages.ts`: build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from a single source; suppresses badges matching the project baseline to reduce noise
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` marks project-level alpha state; corner ribbon reads it automatically
- API reference sidebar: nested groups now always-open via `forceCollapsable` cascade so the full typedoc tree is visible on any API page without re-expanding
- New remark plugin `strip-index-links`: removes trailing `/index/` from typedoc-generated link URLs so module index pages resolve as directory roots
- `astro.config.mjs`: wires `entryFileName=index`, `stripIndexLinks` remark plugin, and `starlight.description` (feeds footer tagline and meta description); clears old `footerText`
- Header wordmark +2px offset removed; baseline now aligns with header text
- Landing copy corrections: "Built into three.js" changed to "Built for three.js" (no implied fork); VP1 opener rewritten to drop false-universal categorical claim; hero subtagline em-dash removed; StatsBanner sprite count 10K+ to 20K+
- Hero shader: side vignette removed; gem flow runs edge-to-edge
- `StatsBanner`: re-enables the `color` prop that was previously deprecated and ignored; each stat now resolves its gem accent via the same `legacyToGem` table used by `FeatureCard` / `ValueProp`
- Stat value text color now driven directly by `--stat-accent` (gem color); previous `color-mix` approach was silently broken in Safari when chained custom properties were used
- Per-stat gem-tinted hairline underline (linear gradient fading right) renders as a colored chord across the stats row
- `data-gem` attribute pattern used for per-stat accent assignment to work around a Safari `color-mix` + inline custom property resolution bug
- Marketing-voice skill: added zero-em-dash-above-fold rule, business jargon ban, model-enforcement requirements, 3-variant + 3-persona audience-review workflow, capability-over-number rule, and two new validation rules preventing false-universals and tooling-only capability claims

Adds a site footer, fixes API reference sidebar navigation, corrects landing-page copy accuracy, and restores gem color accents on the stats banner (including a Safari compatibility fix for chained CSS custom properties in `color-mix`).
