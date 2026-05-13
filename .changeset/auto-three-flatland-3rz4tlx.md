---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### Docs site

**Site footer**
- New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings with per-section hover colors, foil rule top accent
- `lib/packages.ts`: build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges that match the project-wide baseline to reduce noise
- `packages/three-flatland/package.json`: `flatland.badge="Alpha"` marks project-level alpha state for the corner ribbon

**API reference**
- New remark plugin (`strip-index-links.mjs`) strips trailing `/index/` from TypeDoc-generated URLs so module index pages resolve as directory roots
- `astro.config.mjs`: `entryFileName=index`, plugin wired in, `starlight.description` set (feeds footer tagline and meta description), legacy `footerText` cleared

**Theme fixes**
- `Header.astro`: removed +2px wordmark offset; wordmark now baseline-aligns with header text
- `SidebarSublist.astro`: API ref nested groups forced always-open so the full tree is visible on any API page
- `styles/base.css`: removed stale `[data-slot=footer-text]` rules

**Landing copy**
- Section heading changed to "Built for three.js" (previous wording implied an upstream fork)
- VP1 opener rewritten to avoid a false-universal categorical claim about other 2D libraries
- Hero subtagline: em-dash removed; replaced with two short declaratives
- StatsBanner sprite count updated to 20K+
- `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

### StatsBanner

- Re-enabled the `color` prop on `<Stat>` (was marked deprecated and silently ignored)
- Gem name resolves via the same `legacyToGem` table used by `FeatureCard`/`ValueProp`; conventional color names (cyan, blue, green, etc.) map correctly
- Stat value text renders in a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted `text-shadow` glow for legibility
- Each stat row gains a gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord rather than a flat band

Four stats on the landing page now display in diamond, pink, gold, and amethyst as intended.

Docs site gains a structured footer and corrected API reference URL routing; landing copy and stat colors are now accurate and on-brand.
